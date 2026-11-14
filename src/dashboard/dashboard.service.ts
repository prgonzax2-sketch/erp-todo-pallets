import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { IngresoRollo } from '../ingreso-rollos/entities/ingreso-rollo.entity.js';
import { Adelanto } from '../adelantos/entities/adelanto.entity.js';
import { Liquidacion } from '../liquidaciones/entities/liquidacion.entity.js';
import { ConciliacionCoefConfig } from '../conciliacion/entities/conciliacion-coef-config.entity.js';
import { GastoComprobante } from '../gastos/entities/gasto-comprobante.entity.js';
import { DashboardStatsQueryDto } from './dto/dashboard-stats-query.dto.js';
import {
  calcularRangoPeriodo,
  DashboardPeriodo,
  DashboardScope,
  todayYmdLocal,
} from './dashboard-periodo.util.js';
import {
  agregarSubproductos,
  round2,
  SUBPRODUCTOS_CLASIFICACION,
  SUBPRODUCTOS_NOTA,
} from './subproductos.util.js';
import {
  calcP2,
  calcP2Component,
  getCoefConOrigen,
  GRUPOS_ESPECIE,
  normalizarEspecie,
  round3,
  type GrupoEspecie,
  type CoefEspecie,
} from '../conciliacion/conciliacion.utils.js';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ProduccionEntity)
    private readonly produccionRepo: Repository<ProduccionEntity>,
    @InjectRepository(IngresoRollo)
    private readonly ingresoRollosRepo: Repository<IngresoRollo>,
    @InjectRepository(Adelanto)
    private readonly adelantoRepo: Repository<Adelanto>,
    @InjectRepository(Liquidacion)
    private readonly liquidacionRepo: Repository<Liquidacion>,
    @InjectRepository(GastoComprobante)
    private readonly gastosRepo: Repository<GastoComprobante>,
    @Optional() @InjectRepository(ConciliacionCoefConfig)
    private readonly configRepo?: Repository<ConciliacionCoefConfig> | null,
  ) {}

  async getStats(query: DashboardStatsQueryDto, user: AuthenticatedUser) {
    if (user?.rol !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden ver el dashboard.');
    }

    const { aserraderoEfectivo, scope } = this.resolveScope(user, query?.aserradero);
    const rawPeriodo = (query?.periodo || 'day') as string;
    if (rawPeriodo !== 'day' && rawPeriodo !== 'week' && rawPeriodo !== 'month') {
      throw new BadRequestException('Periodo inválido. Use day, week o month.');
    }
    const periodo = rawPeriodo as DashboardPeriodo;
    const fechaRef = query?.fecha ? String(query.fecha).slice(0, 10) : todayYmdLocal();
    let rango;
    try {
      rango = calcularRangoPeriodo(periodo, fechaRef);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Fecha inválida (esperado YYYY-MM-DD).');
    }

    const [produccion, rollos, honorarios, gastosGenerales] = await Promise.all([
      this.getProduccion(rango.desde, rango.hasta, aserraderoEfectivo),
      this.getRollos(rango.desde, rango.hasta, aserraderoEfectivo),
      this.getHonorarios(rango.desde, rango.hasta, aserraderoEfectivo),
      this.getGastosGenerales(rango.desde, rango.hasta, aserraderoEfectivo, scope),
    ]);

    return {
      meta: {
        periodo: rango.periodo,
        fechaRef: rango.fechaRef,
        desde: rango.desde,
        hasta: rango.hasta,
        aserradero: aserraderoEfectivo,
        scope,
      },
      produccion,
      rollos,
      honorarios,
      gastosGenerales,
    };
  }

  private resolveScope(
    user: AuthenticatedUser,
    queryAserradero?: string | null,
  ): { aserraderoEfectivo: string | null; scope: DashboardScope } {
    const userAserradero = typeof user?.aserradero === 'string' ? user.aserradero.trim() : null;
    const requested = typeof queryAserradero === 'string' ? queryAserradero.trim() : '';

    // Admin asignado: forzar su aserradero. Si difiere explícitamente -> 400 (consistente, sin exponer otra planta).
    if (userAserradero) {
      if (requested && requested !== userAserradero) {
        throw new BadRequestException('Un administrador asignado no puede filtrar otro aserradero.');
      }
      return { aserraderoEfectivo: userAserradero, scope: 'asignado' };
    }

    // Admin general/global (sin aserradero): global o filtrado.
    if (requested) {
      return { aserraderoEfectivo: requested, scope: 'general_filtrado' };
    }
    return { aserraderoEfectivo: null, scope: 'global' };
  }

  private async loadCoefOverrides(aserradero: string): Promise<Partial<Record<GrupoEspecie, Partial<CoefEspecie>>>> {
    if (!this.configRepo || !aserradero) return {};
    try {
      const rows = await this.configRepo.find({ where: { aserradero, activo: true } as any });
      const map: any = {};
      for (const r of rows || []) {
        const g = String(r.grupoEspecie || '').toUpperCase() as GrupoEspecie;
        if (!GRUPOS_ESPECIE.includes(g)) continue;
        const ov: any = {
          rendimientoMadera: r.rendimientoMadera, coefAserrin: r.coefAserrin, coefChip: r.coefChip,
          factorTnConsumo: r.factorTnConsumo, m3UtilPorP2: r.m3UtilPorP2,
        };
        // factorTnAserrin/Chip: solo override si número válido > 0; null/inválido => heredar default 0.30 (evita romper planta/global por filas incompletas)
        const fta = Number((r as any).factorTnAserrin), ftc = Number((r as any).factorTnChip);
        if (Number.isFinite(fta) && fta > 0) ov.factorTnAserrin = fta;
        if (Number.isFinite(ftc) && ftc > 0) ov.factorTnChip = ftc;
        map[g] = ov;
      }
      return map;
    } catch { return {}; }
  }

  private p2PorEspecieFromRows(rows: any[]): Record<GrupoEspecie, number> {
    const acc: Record<GrupoEspecie, number> = { PINO: 0, EUCALIPTO: 0, MEZCLA: 0, OTRO: 0 };
    for (const r of rows || []) {
      const u = r.unidadDimensiones;
      const gMain = normalizarEspecie(r.especie);
      acc[gMain] = round3(acc[gMain] + calcP2(r.cantidadPaquetes, r.piezasPorPaquete, r.espesor, r.ancho, r.largo, u));
      for (const c of (r.separadores || [])) {
        const cg = normalizarEspecie(c?.especie || r.especie);
        acc[cg] = round3(acc[cg] + calcP2Component(r.cantidadPaquetes, c, u));
      }
      for (const c of (r.tacos || [])) {
        const cg = normalizarEspecie(c?.especie || r.especie);
        acc[cg] = round3(acc[cg] + calcP2Component(r.cantidadPaquetes, c, u));
      }
    }
    return acc;
  }

  private tnSubproductosFromP2(
    p2PorEspecie: Record<GrupoEspecie, number>,
    overrides?: Partial<Record<GrupoEspecie, Partial<CoefEspecie>>>,
  ) {
    let aTnSum = 0, cTnSum = 0, aParcial = 0, cParcial = 0;
    let aOk = true, cOk = true;
    for (const g of GRUPOS_ESPECIE) {
      const p2 = Number(p2PorEspecie[g] || 0);
      const c = getCoefConOrigen(g, overrides?.[g]).coef;
      const m3Util = p2 * c.m3UtilPorP2;
      const rend = c.rendimientoMadera > 0 ? c.rendimientoMadera : 0.5;
      const m3Rollo = m3Util / rend;
      const aM3 = m3Rollo * c.coefAserrin;
      const chM3 = m3Rollo * c.coefChip;
      const fta = c.factorTnAserrin != null && Number.isFinite(Number(c.factorTnAserrin)) && Number(c.factorTnAserrin) > 0 ? Number(c.factorTnAserrin) : null;
      const ftc = c.factorTnChip != null && Number.isFinite(Number(c.factorTnChip)) && Number(c.factorTnChip) > 0 ? Number(c.factorTnChip) : null;
      const aTn = fta != null ? round3(aM3 * fta) : null;
      const chTn = ftc != null ? round3(chM3 * ftc) : null;
      if (aM3 > 0.0005 && fta == null) aOk = false;
      if (chM3 > 0.0005 && ftc == null) cOk = false;
      if (aTn != null) aTnSum = round3(aTnSum + aTn);
      if (chTn != null) cTnSum = round3(cTnSum + chTn);
      aParcial = round3(aParcial + (aTn != null ? aTn : 0));
      cParcial = round3(cParcial + (chTn != null ? chTn : 0));
    }
    return {
      aserrinTn: aOk ? aTnSum : null,
      chipTn: cOk ? cTnSum : null,
      aserrinTnParcial: aOk ? null : aParcial,
      chipTnParcial: cOk ? null : cParcial,
      aserrinSinFactor: !aOk,
      chipSinFactor: !cOk,
    };
  }

  private async getProduccion(desde: string, hasta: string, aserradero: string | null) {
    const qb = this.produccionRepo
      .createQueryBuilder('p')
      .select('COUNT(*)', 'registros')
      .addSelect('COALESCE(SUM(p.cantidadPaquetes), 0)', 'paquetes')
      .addSelect('COALESCE(SUM(p.cantidadPaquetes * p.piezasPorPaquete), 0)', 'piezas')
      .where('p.fecha >= :desde', { desde })
      .andWhere('p.fecha <= :hasta', { hasta });
    if (aserradero) qb.andWhere('p.aserradero = :aserradero', { aserradero });

    const totals = await qb.getRawOne<{ registros: string; paquetes: string; piezas: string }>();

    const rowsQb = this.produccionRepo
      .createQueryBuilder('p')
      .where('p.fecha >= :desde', { desde })
      .andWhere('p.fecha <= :hasta', { hasta });
    if (aserradero) rowsQb.andWhere('p.aserradero = :aserradero', { aserradero });
    const filas = await rowsQb.getMany();

    const subproductos = agregarSubproductos(filas as any[]);

    // P² (suma variedades) y TN subproductos generados (P²→consumo→m³→TN, factores por aserradero+especie, sin inventar)
    const accP2Global = this.p2PorEspecieFromRows(filas);
    const p2 = round2(Object.values(accP2Global).reduce((a, b) => a + b, 0));

    // TN subproductos: coefs POR ASERRADERO (D-TN-AGG conservador en global)
    let subproductosGenerados: any;
    if (!filas.length) {
      subproductosGenerados = { aserrinTn: 0, chipTn: 0, disponible: true, aserrinSinFactor: false, chipSinFactor: false, nota: 'Sin producción en el período.' };
    } else if (aserradero) {
      const ov = await this.loadCoefOverrides(aserradero);
      const t = this.tnSubproductosFromP2(accP2Global, ov);
      subproductosGenerados = { ...t, disponible: !t.aserrinSinFactor && !t.chipSinFactor, nota: t.aserrinSinFactor || t.chipSinFactor ? 'TN parcial/no disponible: revisar factor TN aserrín/chip (default/override) por aserradero+especie.' : 'TN estimada generada (P² × coeficientes, factor TN default calibrable u override).' };
    } else {
      // Global: agrupar por aserradero, overrides por aserradero, conservador si alguno con generación carece de factor
      const byA = new Map<string, any[]>();
      for (const r of filas as any[]) { const k = String(r.aserradero || '').trim() || '__SIN__'; if (!byA.has(k)) byA.set(k, []); byA.get(k)!.push(r); }
      let aTnSum = 0, cTnSum = 0, aParcial = 0, cParcial = 0, aBlocked = false, cBlocked = false;
      for (const [asKey, aRows] of byA.entries()) {
        try {
          const p2a = this.p2PorEspecieFromRows(aRows);
          const ov = asKey !== '__SIN__' ? await this.loadCoefOverrides(asKey) : {};
          const t = this.tnSubproductosFromP2(p2a, ov) || ({} as any);
          if (t.aserrinSinFactor) aBlocked = true; else aTnSum = round3(Number(aTnSum || 0) + (t.aserrinTn != null ? Number(t.aserrinTn) || 0 : 0));
          if (t.chipSinFactor) cBlocked = true; else cTnSum = round3(Number(cTnSum || 0) + (t.chipTn != null ? Number(t.chipTn) || 0 : 0));
          aParcial = round3(Number(aParcial || 0) + (t.aserrinTn != null ? Number(t.aserrinTn) || 0 : (Number(t.aserrinTnParcial) || 0)));
          cParcial = round3(Number(cParcial || 0) + (t.chipTn != null ? Number(t.chipTn) || 0 : (Number(t.chipTnParcial) || 0)));
        } catch { /* un fallo en un aserradero no debe romper el consolidado global */ }
      }
      subproductosGenerados = {
        aserrinTn: aBlocked ? null : aTnSum,
        chipTn: cBlocked ? null : cTnSum,
        aserrinTnParcial: aBlocked ? aParcial : null,
        chipTnParcial: cBlocked ? cParcial : null,
        disponible: !aBlocked && !cBlocked,
        aserrinSinFactor: aBlocked,
        chipSinFactor: cBlocked,
        nota: aBlocked || cBlocked ? 'TN parcial/no disponible (global): algún aserradero con generación carece de factor TN válido. Revisar default/override por aserradero+especie.' : 'TN estimada generada, agregada (factores por aserradero, default calibrable u override).',
      };
    }

    return {
      registros: Number(totals?.registros || 0),
      paquetes: round2(Number(totals?.paquetes || 0)),
      piezas: round2(Number(totals?.piezas || 0)),
      m3: null,
      m3Nota: 'm³ no calculado en v1: cubicación pendiente de utilidad de dominio.',
      p2,
      p2Nota: 'Estimado: fórmula sistema (P²), asume mm; suma variedades con herencia de componentes.',
      subproductos: {
        ...subproductos,
        clasificacion: SUBPRODUCTOS_CLASIFICACION,
        nota: SUBPRODUCTOS_NOTA,
      },
      subproductosGenerados,
    };
  }

  private async getRollos(desde: string, hasta: string, aserradero: string | null) {
    const qb = this.ingresoRollosRepo
      .createQueryBuilder('i')
      .select('COUNT(*)', 'registros')
      .addSelect('COALESCE(SUM(i.toneladas), 0)', 'toneladas')
      .addSelect('COALESCE(SUM(i.m3), 0)', 'm3')
      .addSelect('COALESCE(SUM(i.totalMadera), 0)', 'totalMadera')
      .where('i.fecha >= :desde', { desde })
      .andWhere('i.fecha <= :hasta', { hasta });
    if (aserradero) qb.andWhere('i.aserradero = :aserradero', { aserradero });

    const raw = await qb.getRawOne<{
      registros: string;
      toneladas: string;
      m3: string;
      totalMadera: string;
    }>();

    return {
      etiqueta: 'Recepción de rollos (ingresos)',
      registros: Number(raw?.registros || 0),
      toneladas: round2(Number(raw?.toneladas || 0)),
      m3: round2(Number(raw?.m3 || 0)),
      totalMadera: round2(Number(raw?.totalMadera || 0)),
      consumoReal: null,
      nota: 'Consumo real pendiente: no existe módulo de salida/consumo de troza.',
    };
  }

  private async getHonorarios(desde: string, hasta: string, aserradero: string | null) {
    // TZ v1 (pragmático): compara por fecha UTC del timestamp (DATE(col AT TIME ZONE 'UTC')).
    // Criterio consistente para bordes día/semana/mes; diferencias extremas de TZ local pueden
    // desplazar bordes marginalmente. Revisar si se requiere TZ operativa específica.
    const adelantosQb = this.adelantoRepo
      .createQueryBuilder('a')
      .innerJoin('a.empleado', 'e')
      .select('COUNT(*)', 'cantidad')
      .addSelect('COALESCE(SUM(a.monto), 0)', 'monto')
      .addSelect('COALESCE(SUM(a.montoEntregado), 0)', 'montoEntregado')
      .where("DATE(a.fecha AT TIME ZONE 'UTC') >= :desde", { desde })
      .andWhere("DATE(a.fecha AT TIME ZONE 'UTC') <= :hasta", { hasta });
    if (aserradero) adelantosQb.andWhere('e.aserradero = :aserradero', { aserradero });

    const liquidacionesQb = this.liquidacionRepo
      .createQueryBuilder('l')
      .innerJoin('l.empleado', 'e')
      .select('COUNT(*)', 'cantidad')
      .addSelect('COALESCE(SUM(l.totalPagado), 0)', 'totalPagado')
      .addSelect('COALESCE(SUM(l.totalGenerado), 0)', 'totalGenerado')
      .where("DATE(l.fechaLiquidacion AT TIME ZONE 'UTC') >= :desde", { desde })
      .andWhere("DATE(l.fechaLiquidacion AT TIME ZONE 'UTC') <= :hasta", { hasta });
    if (aserradero) liquidacionesQb.andWhere('e.aserradero = :aserradero', { aserradero });

    const [adelantosRaw, liquidacionesRaw] = await Promise.all([
      adelantosQb.getRawOne<{ cantidad: string; monto: string; montoEntregado: string }>(),
      liquidacionesQb.getRawOne<{ cantidad: string; totalPagado: string; totalGenerado: string }>(),
    ]);

    return {
      adelantos: {
        cantidad: Number(adelantosRaw?.cantidad || 0),
        monto: round2(Number(adelantosRaw?.monto || 0)),
        montoEntregado: round2(Number(adelantosRaw?.montoEntregado || 0)),
      },
      liquidaciones: {
        cantidad: Number(liquidacionesRaw?.cantidad || 0),
        totalPagado: round2(Number(liquidacionesRaw?.totalPagado || 0)),
        totalGenerado: round2(Number(liquidacionesRaw?.totalGenerado || 0)),
      },
      nota: 'Componentes informativos; adelantos y liquidaciones pueden solaparse contablemente (saldo descontado). Validar criterio contable antes de consolidar.',
    };
  }

  private async getGastosGenerales(
    desde: string,
    hasta: string,
    aserradero: string | null,
    scope: DashboardScope,
  ) {
    const qb = this.gastosRepo
      .createQueryBuilder('g')
      .select('COALESCE(SUM(g.subtotalNeto), 0)', 'subtotalNeto')
      .addSelect('COALESCE(SUM(g.ivaMonto), 0)', 'iva')
      .addSelect('COALESCE(SUM(g.otrosTributos), 0)', 'otrosTributos')
      .addSelect('COALESCE(SUM(g.total), 0)', 'total')
      .where('g.estado = :estado', { estado: 'CONFIRMADO' })
      .andWhere('g.fecha >= :desde', { desde })
      .andWhere('g.fecha <= :hasta', { hasta });
    if (aserradero) qb.andWhere('g.aserraderoNombre = :aserradero', { aserradero });

    const raw = await qb.getRawOne<{
      subtotalNeto: string;
      iva: string;
      otrosTributos: string;
      total: string;
    }>();

    return {
      disponible: true,
      estado: 'ok',
      periodo: { desde, hasta },
      scope,
      aserradero: aserradero ?? null,
      items: [],
      subtotalNeto: round2(Number(raw?.subtotalNeto || 0)),
      iva: round2(Number(raw?.iva || 0)),
      otrosTributos: round2(Number(raw?.otrosTributos || 0)),
      total: round2(Number(raw?.total || 0)),
      nota: 'Egresos operativos confirmados en el período.',
    };
  }
}
