import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { IngresoRollo } from '../ingreso-rollos/entities/ingreso-rollo.entity.js';
import { ConteoPlayaRollo } from '../conteo-playa-rollos/entities/conteo-playa-rollo.entity.js';
import { SubproductoEgreso } from './entities/subproducto-egreso.entity.js';
import { ConciliacionCoefConfig } from './entities/conciliacion-coef-config.entity.js';
import { CreateSubproductoEgresoDto, ConfirmarSubproductoEgresoDto, ListSubproductoEgresoQueryDto } from './dto/subproducto-egreso.dto.js';
import { UpsertConciliacionConfigDto } from './dto/conciliacion-config.dto.js';
import { GrupoEspecie, CoefEspecie, GRUPOS_ESPECIE, calcP2, calcP2Component, getCoef, getCoefConOrigen, normalizarEspecie, round3 } from './conciliacion.utils.js';
import { calcularRangoPeriodo } from '../dashboard/dashboard-periodo.util.js';

function ymdOk(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

@Injectable()
export class ConciliacionService {
  constructor(
    @InjectRepository(ProduccionEntity) private readonly prodRepo: Repository<ProduccionEntity>,
    @InjectRepository(IngresoRollo) private readonly ingresoRepo: Repository<IngresoRollo>,
    @InjectRepository(ConteoPlayaRollo) private readonly conteoRepo: Repository<ConteoPlayaRollo>,
    @InjectRepository(SubproductoEgreso) private readonly egresoRepo: Repository<SubproductoEgreso>,
    @Optional() @InjectRepository(ConciliacionCoefConfig) private readonly configRepo?: Repository<ConciliacionCoefConfig> | null,
  ) {}

  private ensureAdmin(user: AuthenticatedUser) {
    if (user?.rol !== 'admin') throw new ForbiddenException('Solo administradores.');
  }
  private resolveAserradero(user: AuthenticatedUser, requested?: string | null) {
    const userA = typeof user?.aserradero === 'string' ? user.aserradero.trim() : '';
    const req = typeof requested === 'string' ? requested.trim() : '';
    if (userA) { if (req && req !== userA) throw new BadRequestException('No puede operar otro aserradero.'); return userA; }
    if (!req) throw new BadRequestException('Admin general debe indicar aserradero.');
    return req;
  }
  private resolveFiltro(user: AuthenticatedUser, requested?: string | null): string | null {
    const userA = typeof user?.aserradero === 'string' ? user.aserradero.trim() : '';
    if (userA) return userA;
    const req = typeof requested === 'string' ? requested.trim() : '';
    return req || null;
  }

  /** Acumula P2 por grupo de especie desde filas de producción (suma variedades; componentes heredan especie). */
  private accumP2PorEspecie(rows: any[]): Record<GrupoEspecie, number> {
    const acc: Record<GrupoEspecie, number> = { PINO: 0, EUCALIPTO: 0, MEZCLA: 0, OTRO: 0 };
    for (const r of rows || []) {
      const u = r.unidadDimensiones;
      const gMain = normalizarEspecie(r.especie);
      const mainP2 = calcP2(r.cantidadPaquetes, r.piezasPorPaquete, r.espesor, r.ancho, r.largo, u);
      acc[gMain] = round3(acc[gMain] + mainP2);
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

  /** P2 por grupo de especie en rango [desde,hasta] (YYYY-MM-DD). Suma variedades; componentes heredan especie. */
  async p2PorEspecie(aserradero: string, desde: string, hasta: string) {
    const qb = this.prodRepo.createQueryBuilder('p')
      .where('p.fecha >= :desde', { desde }).andWhere('p.fecha <= :hasta', { hasta })
      .andWhere('p.aserradero = :aserradero', { aserradero });
    const rows = await qb.getMany();
    const acc = this.accumP2PorEspecie(rows);
    const total = round3(Object.values(acc).reduce((a, b) => a + b, 0));
    return { desde, hasta, aserradero, p2PorEspecie: acc, p2TotalSumaVariedades: total };
  }

  /** Consumo TN estimado ponderado por especie desde P2 (suma variedades). */
  consumoDesdeP2(p2PorEspecie: Record<GrupoEspecie, number>, overrides?: Partial<Record<GrupoEspecie, Partial<CoefEspecie>>>) {
    let tnTotal = 0; let aserrinGenM3 = 0; let chipGenM3 = 0;
    let aserrinGenTnSum = 0; let chipGenTnSum = 0;
    let aserrinTnOk = true; let chipTnOk = true;
    const gruposSinFactorAserrin: string[] = []; const gruposSinFactorChip: string[] = [];
    const detalle: any = {}; const coefsEfectivos: any = {};
    for (const g of ['PINO', 'EUCALIPTO', 'MEZCLA', 'OTRO'] as GrupoEspecie[]) {
      const p2 = Number(p2PorEspecie[g] || 0);
      const resolved = getCoefConOrigen(g, overrides?.[g]);
      const c = resolved.coef;
      coefsEfectivos[g] = { ...c, origen: resolved.origen };
      const m3Util = p2 * c.m3UtilPorP2;
      const rend = c.rendimientoMadera > 0 ? c.rendimientoMadera : 0.5;
      const m3Rollo = m3Util / rend;
      const tn = m3Rollo * c.factorTnConsumo;
      const aM3 = m3Rollo * c.coefAserrin;
      const chM3 = m3Rollo * c.coefChip;
      // TN subproducto: usa factor configurado o default inicial calibrable (override por aserradero+especie)
      const fta = c.factorTnAserrin != null && Number.isFinite(Number(c.factorTnAserrin)) && Number(c.factorTnAserrin) > 0 ? Number(c.factorTnAserrin) : null;
      const ftc = c.factorTnChip != null && Number.isFinite(Number(c.factorTnChip)) && Number(c.factorTnChip) > 0 ? Number(c.factorTnChip) : null;
      const aTn = fta != null ? round3(aM3 * fta) : null;
      const chTn = ftc != null ? round3(chM3 * ftc) : null;
      if (aM3 > 0.0005 && fta == null) { aserrinTnOk = false; gruposSinFactorAserrin.push(g); }
      if (chM3 > 0.0005 && ftc == null) { chipTnOk = false; gruposSinFactorChip.push(g); }
      if (aTn != null) aserrinGenTnSum = round3(aserrinGenTnSum + aTn);
      if (chTn != null) chipGenTnSum = round3(chipGenTnSum + chTn);
      tnTotal = round3(tnTotal + tn); aserrinGenM3 = round3(aserrinGenM3 + aM3); chipGenM3 = round3(chipGenM3 + chM3);
      detalle[g] = { p2: round3(p2), m3Util: round3(m3Util), m3RolloConsumido: round3(m3Rollo), tnConsumo: round3(tn), aserrinGenM3: round3(aM3), chipGenM3: round3(chM3), aserrinGenTn: aTn, chipGenTn: chTn, factorTnAserrin: fta, factorTnChip: ftc, coef: c, origen: resolved.origen };
    }
    // conservador: TN total null si algún grupo con generación carece de factor
    const aserrinGeneradoEstimadoTn = aserrinTnOk ? aserrinGenTnSum : null;
    const chipGeneradoEstimadoTn = chipTnOk ? chipGenTnSum : null;
    return {
      tnConsumoEstimado: tnTotal,
      aserrinGeneradoEstimadoM3: aserrinGenM3, chipGeneradoEstimadoM3: chipGenM3,
      aserrinGeneradoEstimadoTn, chipGeneradoEstimadoTn,
      aserrinTnParcial: aserrinTnOk ? null : aserrinGenTnSum, chipTnParcial: chipTnOk ? null : chipGenTnSum,
      gruposSinFactorAserrin, gruposSinFactorChip,
      detalle, coefsEfectivos,
      nota: 'Estimado: P2 (fórmula sistema, asume mm) × coeficientes configurables por aserradero+especie. TN subproducto usa factor TN aserrín/chip por defecto inicial (calibrable) u override por aserradero+especie. Ajustar con valores reales.'
    };
  }

  async conciliacion(user: AuthenticatedUser, aserraderoReq?: string | null) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, aserraderoReq);
    const ultimo = await this.conteoRepo.findOne({ where: { aserradero }, order: { fechaCierre: 'DESC', id: 'DESC' } });
    const hoy = new Date().toISOString().slice(0, 10);
    const desde = ultimo ? ultimo.fechaCierre : '0000-01-01';
    // ingresos post-cierre
    let ingresosM3 = 0, ingresosTn = 0, ingresosCount = 0;
    const iqb = this.ingresoRepo.createQueryBuilder('i').select('COUNT(*)','c').addSelect('COALESCE(SUM(i.m3),0)','m3').addSelect('COALESCE(SUM(i.toneladas),0)','tn').where('i.aserradero=:aserradero',{aserradero});
    if (ultimo) iqb.andWhere('i.fecha > :fecha', { fecha: ultimo.fechaCierre });
    const iraw = await iqb.getRawOne<{c:string;m3:string;tn:string}>();
    ingresosCount = Number(iraw?.c||0); ingresosM3 = round3(Number(iraw?.m3||0)); ingresosTn = round3(Number(iraw?.tn||0));
    // P2 y consumo estimado desde último cierre (o todo si no hay cierre)
    const p2 = await this.p2PorEspecie(aserradero, ultimo ? ultimo.fechaCierre : '0000-01-01', hoy);
    // para consumo post-cierre usamos fecha > cierre; aproximación: si hay cierre, recalcular P2 desde día siguiente? p2PorEspecie usa >=desde; ajustamos:
    const p2Post = ultimo ? await this.p2PorEspecie(aserradero, this.nextDay(ultimo.fechaCierre), hoy) : p2;
    const overrides = await this.loadOverrides(aserradero);
    const consumo = this.consumoDesdeP2(p2Post.p2PorEspecie, overrides);
    const p2Hoy = await this.p2PorEspecie(aserradero, hoy, hoy);
    const consumoHoy = this.consumoDesdeP2(p2Hoy.p2PorEspecie, overrides);
    const baseTn = round3(Number(ultimo?.totalTn || 0));
    const baseM3 = round3(Number(ultimo?.totalM3 || 0));
    const tnPlayaEsperada = round3(baseTn + ingresosTn - consumo.tnConsumoEstimado);
    const factorPlaya = Number(ultimo?.factorTnPlaya) > 0 ? Number(ultimo?.factorTnPlaya) : 1.0;
    const m3PlayaEsperada = round3(baseM3 + ingresosM3 - (consumo.tnConsumoEstimado / factorPlaya)); // aprox

    // egresos subproductos (rango post-cierre o mes actual aprox)
    const egDesde = ultimo ? ultimo.fechaCierre : hoy.slice(0,8)+'01';
    const egresos = await this.egresoRepo.createQueryBuilder('e')
      .select('e.tipo','tipo').addSelect('e."especieDeclarada"','especie').addSelect('e.estado','estado')
      .addSelect('COUNT(*)','cantidad').addSelect('COALESCE(SUM(e."tnEstimadas"),0)','tnEstimadas')
      .addSelect('COALESCE(SUM(COALESCE(e."tnReales", e."tnEstimadas")),0)','tnEfectivas')
      .addSelect('COALESCE(SUM(CASE WHEN e."tnReales" IS NULL THEN 1 ELSE 0 END),0)','pendientes')
      .where('e.aserradero=:aserradero',{aserradero}).andWhere('e.fecha >= :d',{d:egDesde}).andWhere('e.fecha <= :h',{h:hoy})
      .groupBy('e.tipo').addGroupBy('e."especieDeclarada"').addGroupBy('e.estado').getRawMany();

    return {
      aserradero,
      ultimoCierre: ultimo ? { id: ultimo.id, fechaCierre: ultimo.fechaCierre, totalM3: baseM3, totalTn: baseTn, factorTnPlaya: ultimo.factorTnPlaya } : null,
      ingresosPostCierre: { registros: ingresosCount, m3: ingresosM3, tn: ingresosTn, desde: ultimo?.fechaCierre || null },
      produccionP2PostCierre: p2Post,
      consumoEstimado: consumo,
      consumoHoy: { fecha: hoy, tnConsumoEstimado: consumoHoy.tnConsumoEstimado, p2TotalSumaVariedades: p2Hoy.p2TotalSumaVariedades, detalle: consumoHoy.detalle, nota: 'Consumo estimado del día (P²→TN), coeficientes configurables. El remanente usa el acumulado post-cierre.' },
      tnRollosEsperadosEnPlaya: tnPlayaEsperada,
      m3RollosEsperadosEnPlayaAprox: m3PlayaEsperada,
      coefsEfectivos: consumo.coefsEfectivos,
      subproductos: {
        egresosResumen: egresos,
        generadoEstimadoM3: { aserrin: consumo.aserrinGeneradoEstimadoM3, chip: consumo.chipGeneradoEstimadoM3 },
        generadoEstimadoTn: { aserrin: consumo.aserrinGeneradoEstimadoTn, chip: consumo.chipGeneradoEstimadoTn, disponible: consumo.aserrinGeneradoEstimadoTn != null && consumo.chipGeneradoEstimadoTn != null, nota: 'TN estimada desde P² usando factor TN aserrín/chip por defecto inicial (calibrable) u override por aserradero+especie.' },
        nota: 'Egresado usa tnReales si existen, si no tnEstimadas (decididas al cargar). Generado es estimado desde P²/consumo (calibrable).'
      },
      notas: ['Conciliación estimada (coeficientes configurables por aserradero+especie; GET/PUT /conciliacion/config). m³ producción real TBD; ajustar m3UtilPorP2/rendimientos con valores reales.']
    };
  }

  private nextDay(ymd: string) {
    const d = new Date(Date.UTC(+ymd.slice(0,4), +ymd.slice(5,7)-1, +ymd.slice(8,10)+1));
    return d.toISOString().slice(0,10);
  }

  // D2: coeficientes por aserradero+especie (fallback defaults)
  private async loadOverrides(aserradero: string): Promise<Partial<Record<GrupoEspecie, Partial<CoefEspecie>>>> {
    if (!this.configRepo) return {};
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

  async getConfigEfectiva(user: AuthenticatedUser, aserraderoReq?: string | null) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, aserraderoReq);
    const overrides = await this.loadOverrides(aserradero);
    const efectivos = GRUPOS_ESPECIE.map((g) => {
      const r = getCoefConOrigen(g, overrides[g]);
      return { grupoEspecie: g, ...r.coef, origen: r.origen, override: overrides[g] || null };
    });
    return { aserradero, efectivos, nota: 'Coeficientes efectivos (fallback defaults; override por aserradero+especie). Calibrar con valores reales.' };
  }

  async upsertConfig(dto: UpsertConciliacionConfigDto, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, dto.aserradero);
    if (!this.configRepo) throw new BadRequestException('Configuración no disponible.');
    if (!Array.isArray(dto.items)) throw new BadRequestException('items requerido.');
    for (const it of dto.items) {
      let row = await this.configRepo.findOne({ where: { aserradero, grupoEspecie: it.grupoEspecie } as any });
      if (!row) row = this.configRepo.create({ aserradero, grupoEspecie: it.grupoEspecie, activo: true, usuario: user?.email || null } as any) as unknown as ConciliacionCoefConfig;
      const setNum = (k: string, v: any) => { if (v === undefined) return; (row as any)[k] = v === null ? null : Number(v); };
      setNum('rendimientoMadera', it.rendimientoMadera); setNum('coefAserrin', it.coefAserrin); setNum('coefChip', it.coefChip);
      setNum('factorTnConsumo', it.factorTnConsumo); setNum('m3UtilPorP2', it.m3UtilPorP2); setNum('factorTnPlayaDefault', it.factorTnPlayaDefault);
      setNum('factorTnAserrin', it.factorTnAserrin); setNum('factorTnChip', it.factorTnChip);
      (row as any).usuario = user?.email || null;
      await this.configRepo.save(row as any);
    }
    return this.getConfigEfectiva(user, aserradero);
  }

  async resetConfigItem(grupoEspecie: string, user: AuthenticatedUser, aserraderoReq?: string | null) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, aserraderoReq);
    if (!this.configRepo) throw new BadRequestException('Configuración no disponible.');
    const g = String(grupoEspecie || '').toUpperCase();
    if (!GRUPOS_ESPECIE.includes(g as GrupoEspecie)) throw new BadRequestException('grupoEspecie inválido.');
    await this.configRepo.delete({ aserradero, grupoEspecie: g } as any);
    return this.getConfigEfectiva(user, aserradero);
  }

  async resetConfigAll(user: AuthenticatedUser, aserraderoReq?: string | null) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, aserraderoReq);
    if (!this.configRepo) throw new BadRequestException('Configuración no disponible.');
    await this.configRepo.delete({ aserradero } as any);
    return this.getConfigEfectiva(user, aserradero);
  }

  // Subproducto egresos
  async createEgreso(dto: CreateSubproductoEgresoDto, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, dto.aserradero);
    if (!ymdOk(dto.fecha)) throw new BadRequestException('fecha inválida.');
    const tnEstimadas = Number(dto.tnEstimadas);
    if (!Number.isFinite(tnEstimadas) || tnEstimadas <= 0) {
      throw new BadRequestException('Ingresá las TN estimadas al momento de cargar (decisión obligatoria, mayor a 0).');
    }
    const precioPorTn = dto.precioPorTn != null && Number.isFinite(Number(dto.precioPorTn)) && Number(dto.precioPorTn) >= 0 ? Number(dto.precioPorTn) : null;
    const e = this.egresoRepo.create({ aserradero, tipo: dto.tipo, fecha: dto.fecha.slice(0,10), especieDeclarada: dto.especieDeclarada || 'MEZCLA', tnEstimadas, precioPorTn, estado: 'ESTIMADO', referencia: dto.referencia || null, observaciones: dto.observaciones || null, usuario: user?.email || null });
    return this.egresoRepo.save(e);
  }
  async confirmarEgreso(id: number, dto: ConfirmarSubproductoEgresoDto, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const e = await this.egresoRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('Egreso no encontrado.');
    const filtro = this.resolveFiltro(user, null); if (filtro && e.aserradero !== filtro) throw new NotFoundException('Egreso no encontrado.');
    e.tnReales = Math.max(0, Number(dto.tnReales) || 0);
    e.estado = e.tnReales === e.tnEstimadas ? 'CONFIRMADO' : 'AJUSTADO';
    if (dto.precioPorTn !== undefined) {
      e.precioPorTn = dto.precioPorTn != null && Number.isFinite(Number(dto.precioPorTn)) && Number(dto.precioPorTn) >= 0 ? Number(dto.precioPorTn) : null;
    }
    return this.egresoRepo.save(e);
  }
  async listEgresos(q: ListSubproductoEgresoQueryDto, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const aserradero = this.resolveFiltro(user, q.aserradero);
    const qb = this.egresoRepo.createQueryBuilder('e').orderBy('e.fecha','DESC').addOrderBy('e.id','DESC');
    if (aserradero) qb.andWhere('e.aserradero=:a',{a:aserradero});
    if (q.tipo) qb.andWhere('e.tipo=:t',{t:q.tipo});
    if (q.desde && ymdOk(q.desde)) qb.andWhere('e.fecha >= :d',{d:q.desde.slice(0,10)});
    if (q.hasta && ymdOk(q.hasta)) qb.andWhere('e.fecha <= :h',{h:q.hasta.slice(0,10)});
    return qb.take(200).getMany();
  }

  private resolveFecha(fechaReq?: string | null) {
    const f = typeof fechaReq === 'string' && ymdOk(fechaReq.trim()) ? fechaReq.trim().slice(0, 10) : new Date().toISOString().slice(0, 10);
    return f;
  }

  /** Remanente rollos en playa (conciliado): Último Cierre + Ingresos post-cierre - Consumo Estimado P² acumulado post-cierre. Incluye consumo de hoy. */
  async remanenteRollos(user: AuthenticatedUser, aserraderoReq?: string | null, fechaReq?: string | null) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, aserraderoReq);
    const hoy = this.resolveFecha(fechaReq);
    const ultimo = await this.conteoRepo.findOne({ where: { aserradero }, order: { fechaCierre: 'DESC', id: 'DESC' } });
    let ingresosM3 = 0, ingresosTn = 0, ingresosCount = 0;
    const iqb = this.ingresoRepo.createQueryBuilder('i').select('COUNT(*)','c').addSelect('COALESCE(SUM(i.m3),0)','m3').addSelect('COALESCE(SUM(i.toneladas),0)','tn').where('i.aserradero=:aserradero',{aserradero});
    if (ultimo) iqb.andWhere('i.fecha > :fecha', { fecha: ultimo.fechaCierre });
    if (hoy) iqb.andWhere('i.fecha <= :hoy', { hoy });
    const iraw = await iqb.getRawOne<{c:string;m3:string;tn:string}>();
    ingresosCount = Number(iraw?.c||0); ingresosM3 = round3(Number(iraw?.m3||0)); ingresosTn = round3(Number(iraw?.tn||0));
    const overrides = await this.loadOverrides(aserradero);
    const p2Desde = ultimo ? this.nextDay(ultimo.fechaCierre) : '0000-01-01';
    const p2Post = await this.p2PorEspecie(aserradero, p2Desde, hoy);
    const consumoPost = this.consumoDesdeP2(p2Post.p2PorEspecie, overrides);
    const p2Hoy = await this.p2PorEspecie(aserradero, hoy, hoy);
    const consumoHoy = this.consumoDesdeP2(p2Hoy.p2PorEspecie, overrides);
    const baseTn = round3(Number(ultimo?.totalTn || 0));
    const baseM3 = round3(Number(ultimo?.totalM3 || 0));
    const factorPlaya = Number(ultimo?.factorTnPlaya) > 0 ? Number(ultimo?.factorTnPlaya) : 1.0;
    const remanenteTn = round3(baseTn + ingresosTn - consumoPost.tnConsumoEstimado);
    const remanenteM3 = round3(baseM3 + ingresosM3 - (consumoPost.tnConsumoEstimado / factorPlaya));
    return {
      aserradero,
      fechaReferencia: hoy,
      ultimoCierre: ultimo ? { id: ultimo.id, fechaCierre: ultimo.fechaCierre, totalM3: baseM3, totalTn: baseTn, factorTnPlaya: ultimo.factorTnPlaya } : null,
      ingresosPostCierre: { registros: ingresosCount, m3: ingresosM3, tn: ingresosTn, desde: ultimo?.fechaCierre || null, hasta: hoy },
      consumoPostCierre: { desde: p2Desde, hasta: hoy, tnConsumoEstimado: consumoPost.tnConsumoEstimado, p2TotalSumaVariedades: p2Post.p2TotalSumaVariedades, detalle: consumoPost.detalle, coefsEfectivos: consumoPost.coefsEfectivos },
      consumoHoy: { fecha: hoy, tnConsumoEstimado: consumoHoy.tnConsumoEstimado, p2TotalSumaVariedades: p2Hoy.p2TotalSumaVariedades, detalle: consumoHoy.detalle },
      remanenteEstimado: { tn: remanenteTn, m3Aprox: remanenteM3, formula: 'Último cierre físico + ingresos posteriores al cierre − consumo estimado P² acumulado post-cierre' },
      notas: [
        'Estimado/conciliado. El remanente descuenta consumo P² acumulado post-cierre (coeficientes configurables por aserradero+especie).',
        'Consumo de hoy es indicador (P² del día → TN); el remanente se concilia con el acumulado hasta el próximo cierre físico.',
        'm³ producción real y calibración (m3UtilPorP2/rendimientos/factorTn) TBD con valores operativos.'
      ]
    };
  }

  /** Stock subproductos (aserrín/chip) en TN: Generado TN (acumulado post-cierre) - Egresos TN (tnEfectivas). TN solo si factor configurado. */
  async subproductosStock(user: AuthenticatedUser, aserraderoReq?: string | null, fechaReq?: string | null, desdeReq?: string | null) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, aserraderoReq);
    const hoy = this.resolveFecha(fechaReq);
    const ultimo = await this.conteoRepo.findOne({ where: { aserradero }, order: { fechaCierre: 'DESC', id: 'DESC' } });
    const overrides = await this.loadOverrides(aserradero);
    const p2Desde = (typeof desdeReq === 'string' && ymdOk(desdeReq.trim())) ? desdeReq.trim().slice(0, 10) : (ultimo ? this.nextDay(ultimo.fechaCierre) : '0000-01-01');
    const p2Post = await this.p2PorEspecie(aserradero, p2Desde, hoy);
    const consumoAcum = this.consumoDesdeP2(p2Post.p2PorEspecie, overrides);
    const p2Hoy = await this.p2PorEspecie(aserradero, hoy, hoy);
    const consumoHoy = this.consumoDesdeP2(p2Hoy.p2PorEspecie, overrides);
    const egDesde = ultimo ? ultimo.fechaCierre : hoy.slice(0, 8) + '01';
    const egRows = await this.egresoRepo.createQueryBuilder('e')
      .select('e.tipo','tipo')
      .addSelect('COALESCE(SUM(COALESCE(e."tnReales", e."tnEstimadas")),0)','tnEfectivas')
      .addSelect('COALESCE(SUM(CASE WHEN e."tnReales" IS NULL THEN 1 ELSE 0 END),0)','pendientes')
      .addSelect('COUNT(*)','registros')
      .where('e.aserradero=:aserradero',{aserradero}).andWhere('e.fecha >= :d',{d:egDesde}).andWhere('e.fecha <= :h',{h:hoy})
      .groupBy('e.tipo').getRawMany();
    const eg = (tipo: string) => { const r = (egRows||[]).find((x:any)=>String(x.tipo)===tipo); return { tnEfectivas: round3(Number(r?.tnEfectivas||0)), pendientesConfirmar: Number(r?.pendientes||0), registros: Number(r?.registros||0) }; };
    const tipoInfo = (tipo: 'ASERRIN'|'CHIP') => {
      const genM3Hoy = tipo==='ASERRIN' ? consumoHoy.aserrinGeneradoEstimadoM3 : consumoHoy.chipGeneradoEstimadoM3;
      const genM3Acum = tipo==='ASERRIN' ? consumoAcum.aserrinGeneradoEstimadoM3 : consumoAcum.chipGeneradoEstimadoM3;
      const genTnHoy = tipo==='ASERRIN' ? consumoHoy.aserrinGeneradoEstimadoTn : consumoHoy.chipGeneradoEstimadoTn;
      const genTnAcum = tipo==='ASERRIN' ? consumoAcum.aserrinGeneradoEstimadoTn : consumoAcum.chipGeneradoEstimadoTn;
      const gruposSin = tipo==='ASERRIN' ? consumoAcum.gruposSinFactorAserrin : consumoAcum.gruposSinFactorChip;
      const parcial = tipo==='ASERRIN' ? consumoAcum.aserrinTnParcial : consumoAcum.chipTnParcial;
      const egresos = eg(tipo);
      const tnDisponible = genTnAcum != null;
      const stockEstimadoTn = tnDisponible ? round3(genTnAcum - egresos.tnEfectivas) : null;
      return {
        tipo,
        generadoHoy: { m3Estimado: genM3Hoy, tnEstimado: genTnHoy, factorConfigurado: genTnHoy != null },
        generadoAcumulado: { desde: p2Desde, hasta: hoy, m3Estimado: genM3Acum, tnEstimado: genTnAcum, tnParcial: parcial, gruposSinFactor: gruposSin, factorConfigurado: tnDisponible },
        egresosAcumulados: { ...egresos, desde: egDesde, hasta: hoy, nota: 'tnEfectivas = tnReales si existen, si no tnEstimadas (D1).' },
        stockEstimadoTn,
        formula: 'Stock estimado TN = Generado TN acumulado (P² post-cierre × coef) − Egresos TN (camiones registrados)',
        fallback: tnDisponible ? null : 'TN no disponible: sin factor TN válido (m³→TN). Revisar default/override por aserradero+especie. Se muestra m³ estimado.'
      };
    };
    return {
      aserradero,
      fechaReferencia: hoy,
      periodoAcumulado: { desde: p2Desde, hasta: hoy, base: ultimo ? `post-cierre ${ultimo.fechaCierre}` : 'sin cierre (histórico)' },
      aserrin: tipoInfo('ASERRIN'),
      chip: tipoInfo('CHIP'),
      coefsEfectivos: consumoAcum.coefsEfectivos,
      notas: [
        'Estimado/calibrable. Generado desde P² × coeficientes configurables por aserradero+especie.',
        'Conversión m³→TN de subproductos usa factor TN por defecto inicial (calibrable) u override por aserradero+especie. Si un override anula el factor, stock TN = null y se muestra m³.',
        'Egresos TN usan tnEfectivas = tnReales ?? tnEstimadas (decisión al cargar, D1).'
      ]
    };
  }

  private resolveGlobalRango(desde?: string | null, hasta?: string | null, fecha?: string | null, periodo?: string | null): { desde: string; hasta: string } {
    if (desde && hasta && ymdOk(desde) && ymdOk(hasta)) return { desde: desde.slice(0, 10), hasta: hasta.slice(0, 10) };
    if (fecha && ymdOk(fecha)) {
      const p = periodo === 'week' || periodo === 'month' ? periodo : 'day';
      const r = calcularRangoPeriodo(p, fecha.slice(0, 10));
      return { desde: r.desde, hasta: r.hasta };
    }
    const hoy = new Date().toISOString().slice(0, 10);
    if (desde && ymdOk(desde) && !hasta) return { desde: desde.slice(0, 10), hasta: hoy };
    if (hasta && ymdOk(hasta) && !desde) return { desde: hasta.slice(0, 10), hasta: hasta.slice(0, 10) };
    return { desde: hoy, hasta: hoy };
  }

  /**
   * Agregado aditivo "Todos los aserraderos" (periodo, estimado) — D-TODOS/D-TN-AGG.
   * Solo admin general. NUNCA consolida remanente/cierre físico por planta.
   * TN subproducto conservador: si algún aserradero con generación carece de factor TN => total null + tnParcial/nota (sin inventar).
   */
  async conciliacionGlobalAgregado(user: AuthenticatedUser, desde?: string | null, hasta?: string | null, fecha?: string | null, periodo?: string | null) {
    this.ensureAdmin(user);
    const userA = typeof user?.aserradero === 'string' ? user.aserradero.trim() : '';
    if (userA) throw new ForbiddenException('Un administrador asignado no puede ver el agregado global (seleccioná su planta).');
    const rango = this.resolveGlobalRango(desde, hasta, fecha, periodo);
    const { desde: d0, hasta: h0 } = rango;

    // Producción todas las plantas en periodo (aditivo)
    const rows = await this.prodRepo.createQueryBuilder('p')
      .where('p.fecha >= :desde', { desde: d0 }).andWhere('p.fecha <= :hasta', { hasta: h0 })
      .getMany();

    // Agrupar por aserradero para aplicar coefs/overrides POR ASERRADERO (D-TN-AGG)
    const byAserradero = new Map<string, any[]>();
    for (const r of rows) {
      const key = String((r as any).aserradero || '').trim() || '__SIN_ASERRADERO__';
      if (!byAserradero.has(key)) byAserradero.set(key, []);
      byAserradero.get(key)!.push(r);
    }

    const p2Global: Record<GrupoEspecie, number> = { PINO: 0, EUCALIPTO: 0, MEZCLA: 0, OTRO: 0 };
    let tnConsumoTotal = 0;
    let aserrinM3 = 0; let chipM3 = 0;
    let aserrinTnSum = 0; let chipTnSum = 0;
    let aserrinTnParcialSum = 0; let chipTnParcialSum = 0;
    let aserrinBlocked = false; let chipBlocked = false;
    const gruposSinFactorAserrin = new Set<string>();
    const gruposSinFactorChip = new Set<string>();
    const aserraderosSinFactorAserrin = new Set<string>();
    const aserraderosSinFactorChip = new Set<string>();
    const coefsEfectivosPorAserradero: any = {};
    const detalleGlobal: any = { PINO: { p2: 0, tnConsumo: 0, aserrinGenM3: 0, chipGenM3: 0 }, EUCALIPTO: { p2: 0, tnConsumo: 0, aserrinGenM3: 0, chipGenM3: 0 }, MEZCLA: { p2: 0, tnConsumo: 0, aserrinGenM3: 0, chipGenM3: 0 }, OTRO: { p2: 0, tnConsumo: 0, aserrinGenM3: 0, chipGenM3: 0 } };

    for (const [asKey, aRows] of byAserradero.entries()) {
      const acc = this.accumP2PorEspecie(aRows);
      for (const g of GRUPOS_ESPECIE) p2Global[g] = round3((p2Global[g] || 0) + (acc[g] || 0));
      const overrides = asKey !== '__SIN_ASERRADERO__' ? await this.loadOverrides(asKey) : {};
      const consumo = this.consumoDesdeP2(acc, overrides);
      coefsEfectivosPorAserradero[asKey] = consumo.coefsEfectivos;
      tnConsumoTotal = round3(tnConsumoTotal + Number(consumo.tnConsumoEstimado || 0));
      aserrinM3 = round3(aserrinM3 + Number(consumo.aserrinGeneradoEstimadoM3 || 0));
      chipM3 = round3(chipM3 + Number(consumo.chipGeneradoEstimadoM3 || 0));
      for (const g of GRUPOS_ESPECIE) {
        const d = (consumo.detalle || {})[g] || {};
        detalleGlobal[g].p2 = round3(detalleGlobal[g].p2 + Number(d.p2 || 0));
        detalleGlobal[g].tnConsumo = round3(detalleGlobal[g].tnConsumo + Number(d.tnConsumo || 0));
        detalleGlobal[g].aserrinGenM3 = round3(detalleGlobal[g].aserrinGenM3 + Number(d.aserrinGenM3 || 0));
        detalleGlobal[g].chipGenM3 = round3(detalleGlobal[g].chipGenM3 + Number(d.chipGenM3 || 0));
      }
      // D-TN-AGG conservador: bloquear total si este aserradero tiene generación m³ y TN no disponible
      if (Number(consumo.aserrinGeneradoEstimadoM3 || 0) > 0.0005 && consumo.aserrinGeneradoEstimadoTn == null) {
        aserrinBlocked = true; aserraderosSinFactorAserrin.add(asKey);
        for (const g of (consumo.gruposSinFactorAserrin || [])) gruposSinFactorAserrin.add(`${asKey}:${g}`);
      }
      if (Number(consumo.chipGeneradoEstimadoM3 || 0) > 0.0005 && consumo.chipGeneradoEstimadoTn == null) {
        chipBlocked = true; aserraderosSinFactorChip.add(asKey);
        for (const g of (consumo.gruposSinFactorChip || [])) gruposSinFactorChip.add(`${asKey}:${g}`);
      }
      if (consumo.aserrinGeneradoEstimadoTn != null) aserrinTnSum = round3(aserrinTnSum + consumo.aserrinGeneradoEstimadoTn);
      if (consumo.chipGeneradoEstimadoTn != null) chipTnSum = round3(chipTnSum + consumo.chipGeneradoEstimadoTn);
      // tnParcial informativo (suma de lo calculable) — sin inventar total
      const aParcial = consumo.aserrinGeneradoEstimadoTn != null ? consumo.aserrinGeneradoEstimadoTn : Number(consumo.aserrinTnParcial || 0);
      const cParcial = consumo.chipGeneradoEstimadoTn != null ? consumo.chipGeneradoEstimadoTn : Number(consumo.chipTnParcial || 0);
      aserrinTnParcialSum = round3(aserrinTnParcialSum + aParcial);
      chipTnParcialSum = round3(chipTnParcialSum + cParcial);
    }

    const p2Total = round3(Object.values(p2Global).reduce((a, b) => a + b, 0));

    // Egresos TN efectivas del periodo, todas las plantas (aditivo, D1)
    const egresos = await this.egresoRepo.createQueryBuilder('e')
      .select('e.tipo', 'tipo').addSelect('e.estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .addSelect('COALESCE(SUM(e."tnEstimadas"),0)', 'tnEstimadas')
      .addSelect('COALESCE(SUM(COALESCE(e."tnReales", e."tnEstimadas")),0)', 'tnEfectivas')
      .addSelect('COALESCE(SUM(CASE WHEN e."tnReales" IS NULL THEN 1 ELSE 0 END),0)', 'pendientes')
      .where('e.fecha >= :d', { d: d0 }).andWhere('e.fecha <= :h', { h: h0 })
      .groupBy('e.tipo').addGroupBy('e.estado').getRawMany();

    const aserrinGeneradoEstimadoTn = aserrinBlocked ? null : aserrinTnSum;
    const chipGeneradoEstimadoTn = chipBlocked ? null : chipTnSum;
    const notaTn = 'TN subproducto (m³→TN) con factor TN aserrín/chip por defecto inicial (calibrable) u override por aserradero+especie.';

    return {
      scope: 'global_agregado',
      aserradero: null,
      periodo: { desde: d0, hasta: h0 },
      ultimoCierre: null,
      ingresosPostCierre: null,
      produccionP2PostCierre: {
        desde: d0,
        hasta: h0,
        aserradero: null,
        p2PorEspecie: p2Global,
        p2TotalSumaVariedades: p2Total,
        nota: 'Agregado aditivo de todas las plantas (periodo), suma variedades. Estimado (fórmula sistema).',
      },
      consumoEstimado: {
        tnConsumoEstimado: tnConsumoTotal,
        aserrinGeneradoEstimadoM3: aserrinM3,
        chipGeneradoEstimadoM3: chipM3,
        aserrinGeneradoEstimadoTn,
        chipGeneradoEstimadoTn,
        aserrinTnParcial: aserrinBlocked ? aserrinTnParcialSum : null,
        chipTnParcial: chipBlocked ? chipTnParcialSum : null,
        gruposSinFactorAserrin: Array.from(gruposSinFactorAserrin),
        gruposSinFactorChip: Array.from(gruposSinFactorChip),
        detalle: detalleGlobal,
        nota: `Consumo/generado estimado (P² periodo × coeficientes POR ASERRADERO, agregados). ${notaTn}`,
      },
      tnRollosEsperadosEnPlaya: null,
      m3RollosEsperadosEnPlayaAprox: null,
      subproductos: {
        egresosResumen: egresos,
        generadoEstimadoM3: { aserrin: aserrinM3, chip: chipM3 },
        generadoEstimadoTn: {
          aserrin: aserrinGeneradoEstimadoTn,
          chip: chipGeneradoEstimadoTn,
          disponible: aserrinGeneradoEstimadoTn != null && chipGeneradoEstimadoTn != null,
          aserrinTnParcial: aserrinBlocked ? aserrinTnParcialSum : null,
          chipTnParcial: chipBlocked ? chipTnParcialSum : null,
          gruposSinFactorAserrin: Array.from(gruposSinFactorAserrin),
          gruposSinFactorChip: Array.from(gruposSinFactorChip),
          aserraderosSinFactorAserrin: Array.from(aserraderosSinFactorAserrin).filter(Boolean),
          aserraderosSinFactorChip: Array.from(aserraderosSinFactorChip).filter(Boolean),
          nota: notaTn,
        },
        nota: 'Agregado aditivo todas las plantas (periodo). Egresado usa tnEfectivas (tnReales ?? tnEstimadas, D1). Generado estimado desde P²/consumo. Sin remanente/cierre físico consolidado.',
      },
      notas: [
        'Agregado aditivo de todos los aserraderos (periodo, estimado).',
        'Remanente/cierre físico es por planta: seleccioná un aserradero para ver conciliación física (cierre, ingresos post-cierre, rollos esperados en playa).',
        notaTn,
      ],
    };
  }

  /** Stock subproductos agregado global (periodo, aditivo) — sin remanente/cierre físico por planta. */
  async subproductosStockGlobal(user: AuthenticatedUser, desde?: string | null, hasta?: string | null, fecha?: string | null) {
    this.ensureAdmin(user);
    const userA = typeof user?.aserradero === 'string' ? user.aserradero.trim() : '';
    if (userA) throw new ForbiddenException('Un administrador asignado no puede ver el agregado global (seleccioná su planta).');
    const rango = this.resolveGlobalRango(desde, hasta, fecha, null);
    const { desde: d0, hasta: h0 } = rango;

    const rows = await this.prodRepo.createQueryBuilder('p')
      .where('p.fecha >= :desde', { desde: d0 }).andWhere('p.fecha <= :hasta', { hasta: h0 })
      .getMany();
    const byAserradero = new Map<string, any[]>();
    for (const r of rows) {
      const key = String((r as any).aserradero || '').trim() || '__SIN_ASERRADERO__';
      if (!byAserradero.has(key)) byAserradero.set(key, []);
      byAserradero.get(key)!.push(r);
    }

    let aserrinM3 = 0; let chipM3 = 0;
    let aserrinTnSum = 0; let chipTnSum = 0; let aserrinTnParcialSum = 0; let chipTnParcialSum = 0;
    let aserrinBlocked = false; let chipBlocked = false;
    const gsfA = new Set<string>(); const gsfC = new Set<string>();
    for (const [asKey, aRows] of byAserradero.entries()) {
      const acc = this.accumP2PorEspecie(aRows);
      const overrides = asKey !== '__SIN_ASERRADERO__' ? await this.loadOverrides(asKey) : {};
      const c = this.consumoDesdeP2(acc, overrides);
      aserrinM3 = round3(aserrinM3 + Number(c.aserrinGeneradoEstimadoM3 || 0));
      chipM3 = round3(chipM3 + Number(c.chipGeneradoEstimadoM3 || 0));
      if (Number(c.aserrinGeneradoEstimadoM3 || 0) > 0.0005 && c.aserrinGeneradoEstimadoTn == null) { aserrinBlocked = true; (c.gruposSinFactorAserrin||[]).forEach((g:any)=>gsfA.add(`${asKey}:${g}`)); }
      if (Number(c.chipGeneradoEstimadoM3 || 0) > 0.0005 && c.chipGeneradoEstimadoTn == null) { chipBlocked = true; (c.gruposSinFactorChip||[]).forEach((g:any)=>gsfC.add(`${asKey}:${g}`)); }
      if (c.aserrinGeneradoEstimadoTn != null) aserrinTnSum = round3(aserrinTnSum + c.aserrinGeneradoEstimadoTn);
      if (c.chipGeneradoEstimadoTn != null) chipTnSum = round3(chipTnSum + c.chipGeneradoEstimadoTn);
      aserrinTnParcialSum = round3(aserrinTnParcialSum + (c.aserrinGeneradoEstimadoTn != null ? c.aserrinGeneradoEstimadoTn : Number(c.aserrinTnParcial || 0)));
      chipTnParcialSum = round3(chipTnParcialSum + (c.chipGeneradoEstimadoTn != null ? c.chipGeneradoEstimadoTn : Number(c.chipTnParcial || 0)));
    }

    const egRows = await this.egresoRepo.createQueryBuilder('e')
      .select('e.tipo', 'tipo')
      .addSelect('COALESCE(SUM(COALESCE(e."tnReales", e."tnEstimadas")),0)', 'tnEfectivas')
      .addSelect('COALESCE(SUM(CASE WHEN e."tnReales" IS NULL THEN 1 ELSE 0 END),0)', 'pendientes')
      .addSelect('COUNT(*)', 'registros')
      .where('e.fecha >= :d', { d: d0 }).andWhere('e.fecha <= :h', { h: h0 })
      .groupBy('e.tipo').getRawMany();
    const eg = (tipo: string) => { const r = (egRows || []).find((x: any) => String(x.tipo) === tipo); return { tnEfectivas: round3(Number(r?.tnEfectivas || 0)), pendientesConfirmar: Number(r?.pendientes || 0), registros: Number(r?.registros || 0) }; };
    const tipoInfo = (tipo: 'ASERRIN' | 'CHIP') => {
      const genM3 = tipo === 'ASERRIN' ? aserrinM3 : chipM3;
      const genTn = tipo === 'ASERRIN' ? (aserrinBlocked ? null : aserrinTnSum) : (chipBlocked ? null : chipTnSum);
      const parcial = tipo === 'ASERRIN' ? (aserrinBlocked ? aserrinTnParcialSum : null) : (chipBlocked ? chipTnParcialSum : null);
      const gsf = tipo === 'ASERRIN' ? Array.from(gsfA) : Array.from(gsfC);
      const egresos = eg(tipo);
      const tnDisponible = genTn != null;
      return {
        tipo,
        generadoHoy: { m3Estimado: null, tnEstimado: null, factorConfigurado: tnDisponible, nota: 'No disponible en agregado global (usar vista por planta).' },
        generadoAcumulado: { desde: d0, hasta: h0, m3Estimado: genM3, tnEstimado: genTn, tnParcial: parcial, gruposSinFactor: gsf, factorConfigurado: tnDisponible },
        egresosAcumulados: { ...egresos, desde: d0, hasta: h0, nota: 'tnEfectivas = tnReales ?? tnEstimadas (D1), todas las plantas.' },
        stockEstimadoTn: tnDisponible ? round3(genTn - egresos.tnEfectivas) : null,
        formula: 'Stock estimado TN = Generado TN acumulado (periodo, todas las plantas) − Egresos TN (todas las plantas)',
        fallback: tnDisponible ? null : 'TN no disponible: configurar factor TN (aserrín/chip) por aserradero+especie (sin valor inventado). Se muestra m³ estimado.',
      };
    };
    return {
      scope: 'global_agregado',
      aserradero: null,
      fechaReferencia: h0,
      periodoAcumulado: { desde: d0, hasta: h0, base: 'agregado aditivo todas las plantas (periodo)' },
      aserrin: tipoInfo('ASERRIN'),
      chip: tipoInfo('CHIP'),
      notas: [
        'Agregado aditivo todas las plantas (periodo, estimado). Sin remanente/cierre físico consolidado por planta.',
        'TN subproducto: factor TN por defecto inicial (calibrable) u override por aserradero+especie.',
      ],
    };
  }
}
