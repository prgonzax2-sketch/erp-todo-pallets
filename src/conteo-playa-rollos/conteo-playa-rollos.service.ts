import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { IngresoRollo } from '../ingreso-rollos/entities/ingreso-rollo.entity.js';
import { ConteoPlayaRollo } from './entities/conteo-playa-rollo.entity.js';
import { ConteoPlayaRolloItem } from './entities/conteo-playa-rollo-item.entity.js';
import { CreateConteoPlayaRolloDto, ListConteoPlayaQueryDto, ResumenPeriodoConteoQueryDto } from './dto/conteo-playa-rollo.dto.js';

function round3(n: number) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}
function ymdOk(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

@Injectable()
export class ConteoPlayaRollosService {
  constructor(
    @InjectRepository(ConteoPlayaRollo) private readonly repo: Repository<ConteoPlayaRollo>,
    @InjectRepository(ConteoPlayaRolloItem) private readonly itemRepo: Repository<ConteoPlayaRolloItem>,
    @InjectRepository(IngresoRollo) private readonly ingresoRepo: Repository<IngresoRollo>,
  ) {}

  private ensureAdmin(user: AuthenticatedUser) {
    if (user?.rol !== 'admin') throw new ForbiddenException('Solo administradores.');
  }

  private resolveAserradero(user: AuthenticatedUser, requested?: string | null) {
    const userA = typeof user?.aserradero === 'string' ? user.aserradero.trim() : '';
    const req = typeof requested === 'string' ? requested.trim() : '';
    if (userA) {
      if (req && req !== userA) throw new BadRequestException('No puede operar otro aserradero.');
      return userA;
    }
    if (!req) throw new BadRequestException('Admin general debe indicar aserradero.');
    return req;
  }

  private resolveAserraderoFiltro(user: AuthenticatedUser, requested?: string | null): string | null {
    const userA = typeof user?.aserradero === 'string' ? user.aserradero.trim() : '';
    const req = typeof requested === 'string' ? requested.trim() : '';
    if (userA) return userA;
    return req || null;
  }

  async create(dto: CreateConteoPlayaRolloDto, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, dto.aserradero);
    if (!ymdOk(dto.fechaCierre)) throw new BadRequestException('fechaCierre inválida (YYYY-MM-DD).');
    if (!Array.isArray(dto.items) || dto.items.length === 0) throw new BadRequestException('Debe incluir al menos un renglón.');
    const factorCierre = Number.isFinite(Number(dto.factorTnPlaya)) ? Math.max(0, Number(dto.factorTnPlaya)) : 1.0;

    let totalM3 = 0;
    let totalTn = 0;
    const items = dto.items.map((it) => {
      const largoRollo = Math.max(0, Number(it.largoRollo) || 0);
      const metrosLineales = Math.max(0, Number(it.metrosLineales) || 0);
      const alto = Math.max(0, Number(it.alto) || 0);
      const m3Pila = round3(largoRollo * metrosLineales * alto);
      const factorTn = Number.isFinite(Number(it.factorTn)) ? Math.max(0, Number(it.factorTn)) : factorCierre;
      const tn = round3(m3Pila * factorTn);
      totalM3 = round3(totalM3 + m3Pila);
      totalTn = round3(totalTn + tn);
      return this.itemRepo.create({ largoRollo, metrosLineales, alto, m3Pila, factorTn, tn, grupoEspecie: it.grupoEspecie || null });
    });

    const conteo = this.repo.create({
      aserradero,
      fechaCierre: dto.fechaCierre.slice(0, 10),
      turno: dto.turno || null,
      tipoPeriodo: dto.tipoPeriodo || 'libre',
      factorTnPlaya: factorCierre,
      totalM3,
      totalTn,
      observaciones: dto.observaciones || null,
      usuario: user?.email || null,
      items,
    });
    return this.repo.save(conteo);
  }

  async list(query: ListConteoPlayaQueryDto, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserraderoFiltro(user, query.aserradero);
    const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10) || 20));
    const qb = this.repo.createQueryBuilder('c').leftJoinAndSelect('c.items', 'i').orderBy('c.fechaCierre', 'DESC').addOrderBy('c.id', 'DESC');
    if (aserradero) qb.andWhere('c.aserradero = :aserradero', { aserradero });
    if (query.desde && ymdOk(query.desde)) qb.andWhere('c.fechaCierre >= :desde', { desde: query.desde.slice(0, 10) });
    if (query.hasta && ymdOk(query.hasta)) qb.andWhere('c.fechaCierre <= :hasta', { hasta: query.hasta.slice(0, 10) });
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
  }

  async get(id: number, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const c = await this.repo.findOne({ where: { id }, relations: { items: true } });
    if (!c) throw new NotFoundException('Conteo no encontrado.');
    const filtro = this.resolveAserraderoFiltro(user, null);
    if (filtro && c.aserradero !== filtro) throw new NotFoundException('Conteo no encontrado.');
    return c;
  }

  async remove(id: number, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const c = await this.get(id, user);
    await this.repo.remove(c);
    return { ok: true };
  }

  async resumenPeriodo(query: ResumenPeriodoConteoQueryDto, user: AuthenticatedUser) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserraderoFiltro(user, query.aserradero);
    const agrupacion = query.agrupacion === 'mes' ? 'month' : 'week';
    const trunc = agrupacion === 'month' ? "date_trunc('month', c.\"fechaCierre\"::date)" : "date_trunc('week', c.\"fechaCierre\"::date)";
    const label = agrupacion === 'month' ? "to_char(date_trunc('month', c.\"fechaCierre\"::date), 'YYYY-MM')" : "to_char(date_trunc('week', c.\"fechaCierre\"::date), 'IYYY-\"W\"IW')";
    const qb = this.repo.createQueryBuilder('c')
      .select(label, 'periodo')
      .addSelect(`MIN(c."fechaCierre")`, 'desde')
      .addSelect(`MAX(c."fechaCierre")`, 'hasta')
      .addSelect('COUNT(*)', 'cierres')
      .addSelect('COALESCE(SUM(c."totalM3"),0)', 'totalM3')
      .addSelect('COALESCE(SUM(c."totalTn"),0)', 'totalTn')
      .addSelect('COALESCE(AVG(c."factorTnPlaya"),0)', 'factorPromedio')
      .groupBy(trunc).addGroupBy(label).orderBy(trunc, 'DESC');
    if (aserradero) qb.andWhere('c.aserradero = :aserradero', { aserradero });
    if (query.desde && ymdOk(query.desde)) qb.andWhere('c."fechaCierre" >= :desde', { desde: query.desde.slice(0, 10) });
    if (query.hasta && ymdOk(query.hasta)) qb.andWhere('c."fechaCierre= :hasta', { hasta: query.hasta.slice(0, 10) });
    const rows = await qb.getRawMany();
    return { aserradero: aserradero || null, agrupacion: query.agrupacion || 'semana', items: rows.map((r: any) => ({ periodo: r.periodo, desde: r.desde, hasta: r.hasta, cierres: Number(r.cierres||0), totalM3: round3(Number(r.totalM3||0)), totalTn: round3(Number(r.totalTn||0)), factorPromedio: round3(Number(r.factorPromedio||0)) })) };
  }

  /**
   * Stock esperado "al momento": último cierre del aserradero + ingresos posteriores al cierre.
   * Ingresos posteriores: fecha (YYYY-MM-DD varchar) > fechaCierre del último cierre.
   * Semanal/mensual: usar list/rangos; este endpoint entrega el estado actual esperado.
   */
  async stockEsperado(user: AuthenticatedUser, aserraderoReq?: string | null) {
    this.ensureAdmin(user);
    const aserradero = this.resolveAserradero(user, aserraderoReq);
    const ultimo = await this.repo.findOne({ where: { aserradero }, order: { fechaCierre: 'DESC', id: 'DESC' }, relations: { items: true } });
    let ingresosM3 = 0;
    let ingresosTn = 0;
    let ingresosCount = 0;
    if (ultimo) {
      const raw = await this.ingresoRepo
        .createQueryBuilder('i')
        .select('COUNT(*)', 'c')
        .addSelect('COALESCE(SUM(i.m3),0)', 'm3')
        .addSelect('COALESCE(SUM(i.toneladas),0)', 'tn')
        .where('i.aserradero = :aserradero', { aserradero })
        .andWhere('i.fecha > :fecha', { fecha: ultimo.fechaCierre })
        .getRawOne<{ c: string; m3: string; tn: string }>();
      ingresosCount = Number(raw?.c || 0);
      ingresosM3 = round3(Number(raw?.m3 || 0));
      ingresosTn = round3(Number(raw?.tn || 0));
    } else {
      // Sin cierre: sumar todos los ingresos del aserradero como referencia (no "consumo estimado" aún)
      const raw = await this.ingresoRepo
        .createQueryBuilder('i')
        .select('COUNT(*)', 'c')
        .addSelect('COALESCE(SUM(i.m3),0)', 'm3')
        .addSelect('COALESCE(SUM(i.toneladas),0)', 'tn')
        .where('i.aserradero = :aserradero', { aserradero })
        .getRawOne<{ c: string; m3: string; tn: string }>();
      ingresosCount = Number(raw?.c || 0);
      ingresosM3 = round3(Number(raw?.m3 || 0));
      ingresosTn = round3(Number(raw?.tn || 0));
    }
    const baseM3 = round3(Number(ultimo?.totalM3 || 0));
    const baseTn = round3(Number(ultimo?.totalTn || 0));
    // TN_playa_esperada (base ingresos+playa, sin descuento consumo P2 aún — se integra en conciliación)
    const stockEsperadoM3 = round3(baseM3 + ingresosM3);
    const stockEsperadoTn = round3(baseTn + ingresosTn);
    return {
      aserradero,
      ultimoCierre: ultimo
        ? { id: ultimo.id, fechaCierre: ultimo.fechaCierre, turno: ultimo.turno, totalM3: baseM3, totalTn: baseTn, factorTnPlaya: ultimo.factorTnPlaya }
        : null,
      ingresosPostCierre: { registros: ingresosCount, m3: ingresosM3, tn: ingresosTn, desde: ultimo ? ultimo.fechaCierre : null },
      stockEsperado: { m3: stockEsperadoM3, tn: stockEsperadoTn, nota: 'Base = último cierre + ingresos posteriores (sin descuento de consumo estimado por P2; ver conciliación).' },
      consumoEstimadoP2: null,
    };
  }
}
