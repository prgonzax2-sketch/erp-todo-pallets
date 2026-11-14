import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Madera } from '../maestros-rollos/entities/madera.entity.js';
import { ProveedorMadera } from '../maestros-rollos/entities/proveedor-madera.entity.js';
import { Quinta } from '../maestros-rollos/entities/quinta.entity.js';
import { Plantacion } from '../maestros-rollos/entities/plantacion.entity.js';
import { Transporte } from '../maestros-rollos/entities/transporte.entity.js';
import { Fletero } from '../maestros-rollos/entities/fletero.entity.js';
import { CuentaCorrienteFleterosService } from '../cuenta-corriente-fleteros/cuenta-corriente-fleteros.service.js';
import { IngresoRollo } from './entities/ingreso-rollo.entity.js';
import { CreateIngresoRolloDto, ListIngresoRollosDto, UpdateIngresoRolloDto } from './dto/ingreso-rollo.dto.js';
import { calcularIngresoRollo, round2 } from './ingreso-rollos.calculos.js';

@Injectable()
export class IngresoRollosService {
  constructor(
    @InjectRepository(IngresoRollo) private readonly repo: Repository<IngresoRollo>,
    @InjectRepository(Madera) private readonly maderaRepo: Repository<Madera>,
    @InjectRepository(ProveedorMadera) private readonly proveedorRepo: Repository<ProveedorMadera>,
    @InjectRepository(Quinta) private readonly quintaRepo: Repository<Quinta>,
    @InjectRepository(Plantacion) private readonly plantacionRepo: Repository<Plantacion>,
    @InjectRepository(Transporte) private readonly transporteRepo: Repository<Transporte>,
    @InjectRepository(Fletero) private readonly fleteroRepo: Repository<Fletero>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ccService: CuentaCorrienteFleterosService,
  ) {}

  private validarAdmin(user: AuthenticatedUser) {
    if (user?.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar ingresos de rollos.');
  }

  private resolveAserradero(user: AuthenticatedUser, dtoAserradero?: string | null, current?: string | null) {
    if (user.aserradero) return user.aserradero;
    const a = (dtoAserradero ?? current ?? '').trim();
    if (!a) throw new BadRequestException('Debes indicar el aserradero del ingreso.');
    return a;
  }

  private assertScope(user: AuthenticatedUser, aserradero: string | null | undefined) {
    if (user.aserradero && aserradero !== user.aserradero) {
      throw new ForbiddenException('No tienes acceso a ingresos de otro aserradero.');
    }
  }

  private deriveMesAnio(fecha: string) {
    const f = String(fecha || '').slice(0, 10);
    const d = new Date(`${f}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return { mes: null, anio: null };
    return { mes: d.getUTCMonth() + 1, anio: d.getUTCFullYear() };
  }

  private normalizeNullableNumber(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private async validarRefs(dto: {
    maderaId?: number;
    proveedorMaderaId?: number;
    transporteId?: number;
    fleteroId?: number;
    quintaId?: number | null;
    plantacionId?: number | null;
  }) {
    if (dto.maderaId !== undefined) {
      const m = await this.maderaRepo.findOneBy({ id: dto.maderaId } as any);
      if (!m) throw new NotFoundException(`Madera #${dto.maderaId} no encontrada.`);
    }
    if (dto.proveedorMaderaId !== undefined) {
      const p = await this.proveedorRepo.findOneBy({ id: dto.proveedorMaderaId } as any);
      if (!p) throw new NotFoundException(`Proveedor de madera #${dto.proveedorMaderaId} no encontrado.`);
    }
    if (dto.transporteId !== undefined) {
      const t = await this.transporteRepo.findOneBy({ id: dto.transporteId } as any);
      if (!t) throw new NotFoundException(`Transporte #${dto.transporteId} no encontrado.`);
    }
    if (dto.fleteroId !== undefined) {
      const f = await this.fleteroRepo.findOneBy({ id: dto.fleteroId } as any);
      if (!f) throw new NotFoundException(`Fletero #${dto.fleteroId} no encontrado.`);
    }
    if (dto.quintaId !== undefined && dto.quintaId !== null) {
      const q = await this.quintaRepo.findOneBy({ id: dto.quintaId } as any);
      if (!q) throw new NotFoundException(`Quinta #${dto.quintaId} no encontrada.`);
    }
    if (dto.plantacionId !== undefined && dto.plantacionId !== null) {
      const p = await this.plantacionRepo.findOneBy({ id: dto.plantacionId } as any);
      if (!p) throw new NotFoundException(`Plantación #${dto.plantacionId} no encontrada.`);
    }
  }

  private async validarDuplicado(
    proveedorMaderaId: number,
    nroRemito: string,
    excludeId?: number,
    repo?: Repository<IngresoRollo>,
  ) {
    const nro = String(nroRemito || '').trim();
    if (!nro) throw new BadRequestException('El número de remito es obligatorio.');
    const where: any = { proveedorMaderaId, nroRemito: nro };
    if (excludeId) where.id = Not(excludeId);
    const exists = await (repo || this.repo).findOne({ where });
    if (exists) {
      throw new ConflictException(
        `Ya existe un ingreso para el proveedor de madera #${proveedorMaderaId} con remito "${nro}" (ingreso #${exists.id}).`,
      );
    }
    return nro;
  }

  private isUniqueConflict(e: unknown) {
    const anyErr = e as any;
    const code = anyErr?.code ?? anyErr?.driverError?.code;
    const constraint = String(anyErr?.constraint ?? anyErr?.driverError?.constraint ?? '');
    return code === '23505' && (constraint.includes('proveedor') || constraint.includes('remito') || constraint.includes('UQ_ingresos_rollos_proveedor_remito'));
  }

  private aplicarCalculos(target: Partial<IngresoRollo>) {
    const calc = calcularIngresoRollo({
      toneladas: target.toneladas,
      precioTnMadera: target.precioTnMadera,
      precioFleteTn: target.precioFleteTn,
      ajustesAdicionalesFlete: target.ajustesAdicionalesFlete,
    });
    Object.assign(target, calc);
  }

  async create(dto: CreateIngresoRolloDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    await this.validarRefs(dto);
    const nroRemitoInput = String(dto.nroRemito || '').trim();
    const aserradero = this.resolveAserradero(user, dto.aserradero);
    const fecha = String(dto.fecha).slice(0, 10);
    const { mes, anio } = this.deriveMesAnio(fecha);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(IngresoRollo);
        const nroRemito = await this.validarDuplicado(dto.proveedorMaderaId, nroRemitoInput, undefined, repo);
        const entity = repo.create({
          maderaId: dto.maderaId,
          proveedorMaderaId: dto.proveedorMaderaId,
          quintaId: dto.quintaId ?? null,
          plantacionId: dto.plantacionId ?? null,
          cargaDDD: dto.cargaDDD?.trim() || null,
          transporteId: dto.transporteId,
          fleteroId: dto.fleteroId,
          nroRemito,
          fecha,
          aserradero,
          mes,
          anio,
          largoMetros: Math.max(0, Number(dto.largoMetros) || 0),
          m3: Math.max(0, Number(dto.m3) || 0),
          toneladas: Math.max(0, Number(dto.toneladas) || 0),
          precioTnMadera: Math.max(0, Number(dto.precioTnMadera) || 0),
          precioFleteTn: Math.max(0, Number(dto.precioFleteTn) || 0),
          ajustesAdicionalesFlete: Number(dto.ajustesAdicionalesFlete) || 0,
          stockCampoM3: this.normalizeNullableNumber(dto.stockCampoM3),
          stockCampoTN: this.normalizeNullableNumber(dto.stockCampoTN),
          utilizacionSemanalRollo: this.normalizeNullableNumber(dto.utilizacionSemanalRollo),
          stockFinalCampo: this.normalizeNullableNumber(dto.stockFinalCampo),
        } as Partial<IngresoRollo>) as IngresoRollo;
        this.aplicarCalculos(entity);
        const saved = await repo.save(entity);
        await this.ccService.syncCreditoViaje(
          { ingresoRolloId: saved.id, fleteroId: saved.fleteroId, fecha: saved.fecha, totalFleteViaje: saved.totalFleteViaje, aserradero: saved.aserradero, nroRemito: saved.nroRemito },
          manager,
        );
        return saved;
      });
    } catch (e) {
      if (this.isUniqueConflict(e)) {
        const nro = String(dto.nroRemito || '').trim();
        throw new ConflictException(`Ya existe un ingreso para el proveedor de madera #${dto.proveedorMaderaId} con remito "${nro}".`);
      }
      throw e;
    }
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const item = await this.repo.findOneBy({ id } as any);
    if (!item) throw new NotFoundException(`Ingreso de rollos #${id} no encontrado.`);
    this.assertScope(user, item.aserradero);
    return item;
  }

  async update(id: number, dto: UpdateIngresoRolloDto, user: AuthenticatedUser) {
    const current = await this.findOne(id, user);
    await this.validarRefs(dto);
    const proveedorMaderaId = dto.proveedorMaderaId ?? current.proveedorMaderaId;
    const nroRemitoEfectivo = dto.nroRemito !== undefined ? String(dto.nroRemito || '').trim() : current.nroRemito;
    const fecha = dto.fecha ? String(dto.fecha).slice(0, 10) : current.fecha;
    const aserradero = this.resolveAserradero(user, dto.aserradero, current.aserradero);
    const { mes, anio } = this.deriveMesAnio(fecha);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(IngresoRollo);
        if (proveedorMaderaId !== current.proveedorMaderaId || nroRemitoEfectivo !== current.nroRemito) {
          await this.validarDuplicado(proveedorMaderaId, nroRemitoEfectivo, id, repo);
        }
        const entity = await repo.findOneBy({ id } as any);
        if (!entity) throw new NotFoundException(`Ingreso de rollos #${id} no encontrado.`);

        if (dto.maderaId !== undefined) entity.maderaId = dto.maderaId;
        if (dto.proveedorMaderaId !== undefined) entity.proveedorMaderaId = dto.proveedorMaderaId;
        if (dto.quintaId !== undefined) entity.quintaId = dto.quintaId ?? null;
        if (dto.plantacionId !== undefined) entity.plantacionId = dto.plantacionId ?? null;
        if (dto.cargaDDD !== undefined) entity.cargaDDD = dto.cargaDDD?.trim() || null;
        if (dto.transporteId !== undefined) entity.transporteId = dto.transporteId;
        if (dto.fleteroId !== undefined) entity.fleteroId = dto.fleteroId;
        entity.nroRemito = nroRemitoEfectivo;
        entity.fecha = fecha;
        entity.aserradero = aserradero;
        entity.mes = mes;
        entity.anio = anio;
        if (dto.largoMetros !== undefined) entity.largoMetros = Math.max(0, Number(dto.largoMetros) || 0);
        if (dto.m3 !== undefined) entity.m3 = Math.max(0, Number(dto.m3) || 0);
        if (dto.toneladas !== undefined) entity.toneladas = Math.max(0, Number(dto.toneladas) || 0);
        if (dto.precioTnMadera !== undefined) entity.precioTnMadera = Math.max(0, Number(dto.precioTnMadera) || 0);
        if (dto.precioFleteTn !== undefined) entity.precioFleteTn = Math.max(0, Number(dto.precioFleteTn) || 0);
        if (dto.ajustesAdicionalesFlete !== undefined) entity.ajustesAdicionalesFlete = Number(dto.ajustesAdicionalesFlete) || 0;
        if (dto.stockCampoM3 !== undefined) entity.stockCampoM3 = this.normalizeNullableNumber(dto.stockCampoM3);
        if (dto.stockCampoTN !== undefined) entity.stockCampoTN = this.normalizeNullableNumber(dto.stockCampoTN);
        if (dto.utilizacionSemanalRollo !== undefined) entity.utilizacionSemanalRollo = this.normalizeNullableNumber(dto.utilizacionSemanalRollo);
        if (dto.stockFinalCampo !== undefined) entity.stockFinalCampo = this.normalizeNullableNumber(dto.stockFinalCampo);

        this.aplicarCalculos(entity);
        const saved = await repo.save(entity);
        await this.ccService.syncCreditoViaje(
          { ingresoRolloId: saved.id, fleteroId: saved.fleteroId, fecha: saved.fecha, totalFleteViaje: saved.totalFleteViaje, aserradero: saved.aserradero, nroRemito: saved.nroRemito },
          manager,
        );
        return saved;
      });
    } catch (e) {
      if (this.isUniqueConflict(e)) {
        throw new ConflictException(`Ya existe un ingreso para el proveedor de madera #${proveedorMaderaId} con remito "${nroRemitoEfectivo}".`);
      }
      throw e;
    }
  }

  async remove(id: number, user: AuthenticatedUser) {
    await this.findOne(id, user);
    await this.dataSource.transaction(async (manager) => {
      await this.ccService.removeCreditoViaje(id, manager);
      await manager.getRepository(IngresoRollo).delete({ id } as any);
    });
    return { message: `Ingreso de rollos #${id} eliminado. Se removió el crédito de flete asociado en CC.` };
  }

  private applyFilters(qb: ReturnType<Repository<IngresoRollo>['createQueryBuilder']>, query: ListIngresoRollosDto, user: AuthenticatedUser) {
    const scopeAserradero = user.aserradero || String(query?.aserradero || '').trim();
    if (scopeAserradero) qb.andWhere('i.aserradero = :aserradero', { aserradero: scopeAserradero });
    if (query?.fechaDesde) qb.andWhere('i.fecha >= :fechaDesde', { fechaDesde: String(query.fechaDesde).slice(0, 10) });
    if (query?.fechaHasta) qb.andWhere('i.fecha <= :fechaHasta', { fechaHasta: String(query.fechaHasta).slice(0, 10) });
    if (query?.maderaId) qb.andWhere('i.maderaId = :maderaId', { maderaId: Number(query.maderaId) });
    if (query?.proveedorMaderaId) qb.andWhere('i.proveedorMaderaId = :proveedorMaderaId', { proveedorMaderaId: Number(query.proveedorMaderaId) });
    if (query?.transporteId) qb.andWhere('i.transporteId = :transporteId', { transporteId: Number(query.transporteId) });
    if (query?.fleteroId) qb.andWhere('i.fleteroId = :fleteroId', { fleteroId: Number(query.fleteroId) });
    return qb;
  }

  async findAll(query: ListIngresoRollosDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query?.limit) || 50));
    const qb = this.applyFilters(this.repo.createQueryBuilder('i'), query, user)
      .orderBy('i.fecha', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    const totalsRaw = await this.applyFilters(this.repo.createQueryBuilder('i'), query, user)
      .select('COALESCE(SUM(i.toneladas), 0)', 'toneladas')
      .addSelect('COALESCE(SUM(i.m3), 0)', 'm3')
      .addSelect('COALESCE(SUM(i.totalMadera), 0)', 'totalMadera')
      .addSelect('COALESCE(SUM(i.totalFleteViaje), 0)', 'totalFletes')
      .getRawOne<{ toneladas: string; m3: string; totalMadera: string; totalFletes: string }>();

    return {
      data,
      total,
      page,
      limit,
      totales: {
        toneladas: round2(Number(totalsRaw?.toneladas || 0)),
        m3: round2(Number(totalsRaw?.m3 || 0)),
        totalMadera: round2(Number(totalsRaw?.totalMadera || 0)),
        totalFletes: round2(Number(totalsRaw?.totalFletes || 0)),
      },
    };
  }

  private csvEscape(v: unknown) {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async exportCsv(query: ListIngresoRollosDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const rows = await this.applyFilters(this.repo.createQueryBuilder('i'), query, user)
      .orderBy('i.fecha', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .getMany();
    const header = [
      'id', 'fecha', 'aserradero', 'maderaId', 'proveedorMaderaId', 'quintaId', 'plantacionId', 'cargaDDD',
      'transporteId', 'fleteroId', 'nroRemito', 'largoMetros', 'm3', 'toneladas', 'precioTnMadera',
      'subtotalBruto', 'iva', 'totalMadera', 'precioFleteTn', 'subtotalFlete', 'ajustesAdicionalesFlete', 'totalFleteViaje',
      'stockCampoM3', 'stockCampoTN', 'utilizacionSemanalRollo', 'stockFinalCampo', 'mes', 'anio',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.id, r.fecha, r.aserradero, r.maderaId, r.proveedorMaderaId, r.quintaId, r.plantacionId, r.cargaDDD,
        r.transporteId, r.fleteroId, r.nroRemito, r.largoMetros, r.m3, r.toneladas, r.precioTnMadera,
        r.subtotalBruto, r.iva, r.totalMadera, r.precioFleteTn, r.subtotalFlete, r.ajustesAdicionalesFlete, r.totalFleteViaje,
        r.stockCampoM3, r.stockCampoTN, r.utilizacionSemanalRollo, r.stockFinalCampo, r.mes, r.anio,
      ].map((v) => this.csvEscape(v)).join(','));
    }
    return '\uFEFF' + lines.join('\r\n');
  }
}
