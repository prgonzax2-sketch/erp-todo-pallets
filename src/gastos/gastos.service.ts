import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { Proveedor } from '../proveedores/entities/proveedor.entity.js';
import { Rubro } from '../rubros/entities/rubro.entity.js';
import { CreateGastoDto } from './dto/create-gasto.dto.js';
import { UpdateGastoDto } from './dto/update-gasto.dto.js';
import { QueryGastoDto } from './dto/query-gasto.dto.js';
import { AnularGastoDto } from './dto/anular-gasto.dto.js';
import { GastoLineaItemDto } from './dto/gasto-linea-item.dto.js';
import { GastoComprobante } from './entities/gasto-comprobante.entity.js';
import { GastoLinea } from './entities/gasto-linea.entity.js';
import {
  calcularCabecera,
  calcularNetoLinea,
  derivarMesAnio,
  esTipoInterno,
  generarNumeroInterno,
  round2,
} from './gastos.calculos.js';

type ScopedAserradero = { id: number; nombre: string };

@Injectable()
export class GastosService {
  constructor(
    @InjectRepository(GastoComprobante)
    private readonly repo: Repository<GastoComprobante>,
    @InjectRepository(GastoLinea)
    private readonly lineasRepo: Repository<GastoLinea>,
    @InjectRepository(Aserradero)
    private readonly aserraderosRepo: Repository<Aserradero>,
    @InjectRepository(Area)
    private readonly areasRepo: Repository<Area>,
    @InjectRepository(Proveedor)
    private readonly proveedoresRepo: Repository<Proveedor>,
    @InjectRepository(Rubro)
    private readonly rubrosRepo: Repository<Rubro>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private esAdmin(user: AuthenticatedUser): boolean {
    return user?.rol === 'admin';
  }

  private esAdminAsignado(user: AuthenticatedUser): boolean {
    return this.esAdmin(user) && !!user?.aserradero?.trim();
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (!this.esAdmin(user)) {
      throw new ForbiddenException('Solo los administradores pueden gestionar gastos.');
    }
  }

  private normStr(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s || null;
  }

  private reqStr(v: unknown, label: string, max = 120): string {
    const s = this.normStr(v);
    if (!s) throw new BadRequestException(`${label} es obligatorio.`);
    if (s.length > max) throw new BadRequestException(`${label} excede el máximo (${max}).`);
    return s;
  }

  private normFecha(v: unknown, label = 'La fecha'): string {
    const s = String(v || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw new BadRequestException(`${label} debe tener formato YYYY-MM-DD.`);
    }
    return s;
  }

  private isUniqueConflict(e: unknown): boolean {
    const anyErr = e as any;
    const code = anyErr?.code ?? anyErr?.driverError?.code;
    return code === '23505';
  }

  private async resolverAserraderoPorNombre(
    nombre: string,
    repo?: Repository<Aserradero>,
  ): Promise<ScopedAserradero> {
    const r = repo || this.aserraderosRepo;
    const normalizado = String(nombre || '').trim();
    const aserradero = await r
      .createQueryBuilder('a')
      .where('LOWER(TRIM(a.nombre)) = LOWER(:nombre)', { nombre: normalizado })
      .andWhere('a.activo = true')
      .getOne();
    if (!aserradero) {
      throw new BadRequestException(`El aserradero "${normalizado}" no existe o está inactivo.`);
    }
    return { id: aserradero.id, nombre: aserradero.nombre };
  }

  private async resolverAserraderoPorId(
    id: number,
    repo?: Repository<Aserradero>,
  ): Promise<ScopedAserradero> {
    const r = repo || this.aserraderosRepo;
    const aserradero = await r.findOneBy({ id });
    if (!aserradero || !aserradero.activo) {
      throw new BadRequestException(`El aserradero #${id} no existe o está inactivo.`);
    }
    return { id: aserradero.id, nombre: aserradero.nombre };
  }

  private async resolverScopeAserradero(
    user: AuthenticatedUser,
    requestedAserraderoId?: number | null,
    manager?: EntityManager,
  ): Promise<ScopedAserradero | null> {
    const aRepo = manager ? manager.getRepository(Aserradero) : this.aserraderosRepo;
    if (this.esAdminAsignado(user)) {
      return this.resolverAserraderoPorNombre(user.aserradero as string, aRepo);
    }
    if (requestedAserraderoId != null && Number.isFinite(Number(requestedAserraderoId))) {
      return this.resolverAserraderoPorId(Number(requestedAserraderoId), aRepo);
    }
    return null;
  }

  private async resolverArea(
    areaId: number,
    scope: ScopedAserradero | null,
    manager?: EntityManager,
  ): Promise<Area> {
    const aRepo = manager ? manager.getRepository(Area) : this.areasRepo;
    const area = await aRepo.findOne({ where: { id: areaId } });
    if (!area) throw new NotFoundException(`Área #${areaId} no encontrada.`);
    if (!area.activo) throw new BadRequestException(`El área #${areaId} está inactiva.`);
    if (scope && area.aserraderoId !== scope.id) {
      throw new ForbiddenException('No puede usar un área de otro aserradero.');
    }
    return area;
  }

  private async resolverProveedor(
    proveedorId: number | null | undefined,
    proveedorNombreDto: string | null | undefined,
    manager?: EntityManager,
  ): Promise<{ proveedorId: number | null; proveedorNombre: string | null }> {
    if (proveedorId == null) {
      return { proveedorId: null, proveedorNombre: this.normStr(proveedorNombreDto) };
    }
    const pRepo = manager ? manager.getRepository(Proveedor) : this.proveedoresRepo;
    const proveedor = await pRepo.findOneBy({ id: proveedorId });
    if (!proveedor) throw new NotFoundException(`Proveedor #${proveedorId} no encontrado.`);
    if (!proveedor.activo) throw new BadRequestException(`El proveedor #${proveedorId} está inactivo.`);
    return { proveedorId: proveedor.id, proveedorNombre: proveedor.razonSocial };
  }

  private async resolverRubros(
    lineas: GastoLineaItemDto[],
    manager?: EntityManager,
  ): Promise<Map<number, Rubro>> {
    const rRepo = manager ? manager.getRepository(Rubro) : this.rubrosRepo;
    const ids = [...new Set(lineas.map((l) => Number(l.rubroId)).filter((n) => Number.isFinite(n) && n > 0))];
    const map = new Map<number, Rubro>();
    for (const id of ids) {
      const rubro = await rRepo.findOneBy({ id });
      if (!rubro) throw new NotFoundException(`Rubro #${id} no encontrado.`);
      if (!rubro.activo) throw new BadRequestException(`El rubro #${id} está inactivo.`);
      map.set(id, rubro);
    }
    return map;
  }

  private fiscalUniquenessKey(dto: {
    proveedorId?: number | null;
    tipoComprobante: string;
    puntoVenta?: string | null;
    numeroComprobante?: string | null;
  }) {
    const tipo = String(dto.tipoComprobante || '').trim().toUpperCase();
    const numero = this.normStr(dto.numeroComprobante);
    if (esTipoInterno(tipo)) return null;
    if (!numero) return null;
    return {
      proveedorId: dto.proveedorId ?? null,
      tipo,
      puntoVenta: this.normStr(dto.puntoVenta) || '',
      numero,
    };
  }

  private async assertUnicidadFiscal(
    manager: EntityManager,
    dto: {
      proveedorId?: number | null;
      tipoComprobante: string;
      puntoVenta?: string | null;
      numeroComprobante?: string | null;
    },
    excludeId?: number,
  ) {
    const key = this.fiscalUniquenessKey(dto);
    if (!key) return;
    const qb = manager
      .getRepository(GastoComprobante)
      .createQueryBuilder('g')
      .where('UPPER(g.tipoComprobante) = :tipo', { tipo: key.tipo })
      .andWhere("COALESCE(g.puntoVenta, '') = :pv", { pv: key.puntoVenta })
      .andWhere("COALESCE(g.numeroComprobante, '') = :num", { num: key.numero })
      .andWhere("g.estado <> 'ANULADO'");
    if (key.proveedorId == null) qb.andWhere('g.proveedorId IS NULL');
    else qb.andWhere('g.proveedorId = :proveedorId', { proveedorId: key.proveedorId });
    if (excludeId) qb.andWhere('g.id <> :excludeId', { excludeId });
    const exists = await qb.getOne();
    if (exists) {
      throw new ConflictException(
        `Ya existe un comprobante fiscal con proveedor/tipo/punto de venta/número indicados (gasto #${exists.id}).`,
      );
    }
  }

  private buildLineas(
    items: GastoLineaItemDto[],
    rubros: Map<number, Rubro>,
    comprobanteId: number,
  ): Partial<GastoLinea>[] {
    return (items || []).map((l, i) => {
      const rubro = rubros.get(Number(l.rubroId));
      const neto = calcularNetoLinea({ cantidad: l.cantidad, precioUnitario: l.precioUnitario });
      return {
        gastoComprobanteId: comprobanteId,
        rubroId: Number(l.rubroId),
        rubroNombre: rubro?.nombre ?? null,
        descripcion: this.normStr(l.descripcion),
        cantidad: Math.max(0, Number(l.cantidad) || 0),
        precioUnitario: Math.max(0, Number(l.precioUnitario) || 0),
        neto,
        orden: Number.isFinite(Number(l.orden)) ? Number(l.orden) : i,
      };
    });
  }

  private applyCalculos(entity: GastoComprobante, lineas: Array<{ cantidad?: unknown; precioUnitario?: unknown }>) {
    const calc = calcularCabecera({
      lineas,
      ivaAlicuota: entity.ivaAlicuota,
      ivaExento: entity.ivaExento,
      otrosTributos: entity.otrosTributos,
    });
    entity.subtotalNeto = calc.subtotalNeto;
    entity.ivaMonto = calc.ivaMonto;
    entity.otrosTributos = calc.otrosTributos;
    entity.total = calc.total;
  }

  private assertEditable(entity: GastoComprobante) {
    if (entity.estado !== 'BORRADOR') {
      throw new BadRequestException('Solo se pueden editar gastos en estado BORRADOR.');
    }
  }

  private actorLabel(user: AuthenticatedUser): string {
    return user?.email || `usuario:${user?.sub ?? '?'}`;
  }

  async create(dto: CreateGastoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const responsable = this.reqStr(dto.responsable, 'El responsable');
    const fecha = this.normFecha(dto.fecha);
    const { mes, anio } = derivarMesAnio(fecha);
    if (mes == null || anio == null) throw new BadRequestException('Fecha inválida.');

    try {
      return await this.dataSource.transaction(async (manager) => {
        const scope = await this.resolverScopeAserradero(user, dto.aserraderoId, manager);
        const area = await this.resolverArea(dto.areaId, scope, manager);
        const aserradero = await this.resolverAserraderoPorId(area.aserraderoId, manager.getRepository(Aserradero));
        if (scope && aserradero.id !== scope.id) {
          throw new ForbiddenException('No puede cargar gastos en otro aserradero.');
        }
        const proveedor = await this.resolverProveedor(dto.proveedorId, dto.proveedorNombre, manager);
        const lineItems = Array.isArray(dto.lineas) ? dto.lineas : [];
        const rubros = await this.resolverRubros(lineItems, manager);

        const tipo = String(dto.tipoComprobante || '').trim().toUpperCase();
        // Tipos internos (X/ACUSE/RECIBO/ORDEN): ignorar nº manual y autogenerar [TIPO]-[ID_BD] (unicidad garantizada).
        const numeroNorm = esTipoInterno(tipo) ? null : this.normStr(dto.numeroComprobante);
        await this.assertUnicidadFiscal(manager, {
          proveedorId: proveedor.proveedorId,
          tipoComprobante: tipo,
          puntoVenta: dto.puntoVenta,
          numeroComprobante: numeroNorm,
        });

        const repo = manager.getRepository(GastoComprobante);
        const entity = repo.create({
          aserraderoId: aserradero.id,
          aserraderoNombre: aserradero.nombre,
          areaId: area.id,
          areaNombre: area.nombre,
          fecha,
          mes,
          anio,
          proveedorId: proveedor.proveedorId,
          proveedorNombre: proveedor.proveedorNombre,
          tipoComprobante: tipo,
          puntoVenta: this.normStr(dto.puntoVenta),
          numeroComprobante: numeroNorm,
          responsable,
          estado: 'BORRADOR',
          moneda: 'ARS',
          ivaAlicuota: dto.ivaExento === true ? 0 : (Number(dto.ivaAlicuota) || 0),
          ivaExento: dto.ivaExento === true,
          otrosTributos: round2(Math.max(0, Number(dto.otrosTributos) || 0)),
          observaciones: this.normStr(dto.observaciones),
          creadoPorUsuarioId: user?.sub ?? null,
          creadoPor: this.actorLabel(user),
        } as Partial<GastoComprobante>) as GastoComprobante;

        const calcLineas = lineItems.map((l) => ({ cantidad: l.cantidad, precioUnitario: l.precioUnitario }));
        this.applyCalculos(entity, calcLineas);
        const saved = await repo.save(entity);

        if (esTipoInterno(tipo) && !this.normStr(saved.numeroComprobante)) {
          saved.numeroComprobante = generarNumeroInterno(tipo, saved.id);
          await repo.save(saved);
        }

        if (lineItems.length) {
          const lineas = this.buildLineas(lineItems, rubros, saved.id).map((l) =>
            manager.getRepository(GastoLinea).create(l),
          );
          await manager.getRepository(GastoLinea).save(lineas);
        }

        return this.findOneWithManager(saved.id, user, manager);
      });
    } catch (e) {
      if (this.isUniqueConflict(e)) {
        throw new ConflictException('Conflicto de unicidad del comprobante. Verifique proveedor/tipo/punto de venta/número.');
      }
      throw e;
    }
  }

  private async findOneWithManager(id: number, user: AuthenticatedUser, manager: EntityManager) {
    const item = await manager.getRepository(GastoComprobante).findOne({
      where: { id },
      relations: { lineas: { rubro: true }, area: true, proveedor: true, aserradero: true },
      order: { lineas: { orden: 'ASC', id: 'ASC' } } as any,
    });
    if (!item) throw new NotFoundException(`Gasto #${id} no encontrado.`);
    await this.assertScope(user, item);
    return item;
  }

  private async assertScope(user: AuthenticatedUser, item: GastoComprobante) {
    if (!this.esAdminAsignado(user)) return;
    const scope = await this.resolverAserraderoPorNombre(user.aserradero as string);
    if (item.aserraderoId !== scope.id) {
      throw new ForbiddenException('No tiene acceso a gastos de otro aserradero.');
    }
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const item = await this.repo.findOne({
      where: { id },
      relations: { lineas: { rubro: true }, area: true, proveedor: true, aserradero: true },
      order: { lineas: { orden: 'ASC', id: 'ASC' } } as any,
    });
    if (!item) throw new NotFoundException(`Gasto #${id} no encontrado.`);
    await this.assertScope(user, item);
    return item;
  }

  async update(id: number, dto: UpdateGastoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(GastoComprobante);
        const item = await repo.findOne({ where: { id }, relations: { lineas: true } });
        if (!item) throw new NotFoundException(`Gasto #${id} no encontrado.`);
        await this.assertScope(user, item);
        this.assertEditable(item);

        const scope = await this.resolverScopeAserradero(user, dto.aserraderoId ?? item.aserraderoId, manager);

        if (dto.areaId !== undefined) {
          const area = await this.resolverArea(dto.areaId, scope, manager);
          const aserradero = await this.resolverAserraderoPorId(area.aserraderoId, manager.getRepository(Aserradero));
          if (scope && aserradero.id !== scope.id) {
            throw new ForbiddenException('No puede mover el gasto a otro aserradero.');
          }
          item.areaId = area.id;
          item.areaNombre = area.nombre;
          item.aserraderoId = aserradero.id;
          item.aserraderoNombre = aserradero.nombre;
        } else if (scope && item.aserraderoId !== scope.id) {
          throw new ForbiddenException('No tiene acceso a gastos de otro aserradero.');
        }

        if (dto.fecha !== undefined) {
          item.fecha = this.normFecha(dto.fecha);
          const { mes, anio } = derivarMesAnio(item.fecha);
          if (mes == null || anio == null) throw new BadRequestException('Fecha inválida.');
          item.mes = mes;
          item.anio = anio;
        }

        if (dto.proveedorId !== undefined || dto.proveedorNombre !== undefined) {
          const proveedor = await this.resolverProveedor(
            dto.proveedorId === undefined ? item.proveedorId : dto.proveedorId,
            dto.proveedorNombre === undefined ? item.proveedorNombre : dto.proveedorNombre,
            manager,
          );
          item.proveedorId = proveedor.proveedorId;
          item.proveedorNombre = proveedor.proveedorNombre;
        }

        if (dto.tipoComprobante !== undefined) item.tipoComprobante = String(dto.tipoComprobante).trim().toUpperCase();
        if (dto.puntoVenta !== undefined) item.puntoVenta = this.normStr(dto.puntoVenta);
        // Tipos internos: siempre autogen [TIPO]-[ID_BD] (ignora nº manual) para unicidad garantizada.
        if (esTipoInterno(item.tipoComprobante)) {
          item.numeroComprobante = generarNumeroInterno(item.tipoComprobante, item.id);
        } else if (dto.numeroComprobante !== undefined) {
          item.numeroComprobante = this.normStr(dto.numeroComprobante);
        }
        if (dto.responsable !== undefined) item.responsable = this.reqStr(dto.responsable, 'El responsable');
        if (dto.ivaAlicuota !== undefined) item.ivaAlicuota = Number(dto.ivaAlicuota) || 0;
        if (dto.ivaExento !== undefined) item.ivaExento = dto.ivaExento === true;
        // Normalizar EXENTO: iva_exento => alícuota 0 (monto ya se fuerza en cálculos)
        if (item.ivaExento) item.ivaAlicuota = 0;
        if (dto.otrosTributos !== undefined) item.otrosTributos = round2(Math.max(0, Number(dto.otrosTributos) || 0));
        if (dto.observaciones !== undefined) item.observaciones = this.normStr(dto.observaciones);

        await this.assertUnicidadFiscal(manager, item, item.id);

        let lineItemsForCalc: Array<{ cantidad?: unknown; precioUnitario?: unknown }> = (item.lineas || []).map((l) => ({ cantidad: l.cantidad, precioUnitario: l.precioUnitario }));
        if (dto.lineas !== undefined) {
          const newItems = Array.isArray(dto.lineas) ? dto.lineas : [];
          const rubros = await this.resolverRubros(newItems, manager);
          await manager.getRepository(GastoLinea).delete({ gastoComprobanteId: item.id });
          if (newItems.length) {
            const lineas = this.buildLineas(newItems, rubros, item.id).map((l) =>
              manager.getRepository(GastoLinea).create(l),
            );
            await manager.getRepository(GastoLinea).save(lineas);
          }
          lineItemsForCalc = newItems;
        }

        this.applyCalculos(item, lineItemsForCalc);
        await repo.save(item);
        return this.findOneWithManager(item.id, user, manager);
      });
    } catch (e) {
      if (this.isUniqueConflict(e)) {
        throw new ConflictException('Conflicto de unicidad del comprobante. Verifique proveedor/tipo/punto de venta/número.');
      }
      throw e;
    }
  }

  async confirmar(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(GastoComprobante);
        const item = await repo.findOne({ where: { id }, relations: { lineas: true } });
        if (!item) throw new NotFoundException(`Gasto #${id} no encontrado.`);
        await this.assertScope(user, item);
        if (item.estado !== 'BORRADOR') {
          throw new BadRequestException('Solo se puede confirmar un gasto en estado BORRADOR.');
        }
        const lineas = Array.isArray(item.lineas) ? item.lineas : [];
        if (lineas.length < 1) {
          throw new BadRequestException('No se puede confirmar un gasto sin líneas.');
        }
        // Internos: forzar autogen (unicidad garantizada)
        if (esTipoInterno(item.tipoComprobante)) {
          item.numeroComprobante = generarNumeroInterno(item.tipoComprobante, item.id);
        }
        if (item.ivaExento) item.ivaAlicuota = 0;
        await this.assertUnicidadFiscal(manager, item, item.id);
        this.applyCalculos(item, lineas);
        item.estado = 'CONFIRMADO';
        item.confirmadoAt = new Date();
        item.confirmadoPor = this.actorLabel(user);
        await repo.save(item);
        return this.findOneWithManager(item.id, user, manager);
      });
    } catch (e) {
      if (this.isUniqueConflict(e)) {
        throw new ConflictException('Conflicto de unicidad del comprobante. Verifique proveedor/tipo/punto de venta/número.');
      }
      throw e;
    }
  }

  async anular(id: number, dto: AnularGastoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const motivo = this.reqStr(dto?.motivo, 'El motivo de anulación', 500);
    if (motivo.length < 3) {
      throw new BadRequestException('El motivo de anulación debe tener al menos 3 caracteres.');
    }
    return await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(GastoComprobante);
      const item = await repo.findOne({ where: { id } });
      if (!item) throw new NotFoundException(`Gasto #${id} no encontrado.`);
      await this.assertScope(user, item);
      if (item.estado === 'ANULADO') {
        throw new BadRequestException('El gasto ya se encuentra anulado.');
      }
      if (item.estado !== 'CONFIRMADO' && item.estado !== 'BORRADOR') {
        throw new BadRequestException('Estado de gasto inválido para anular.');
      }
      item.estado = 'ANULADO';
      item.anuladoAt = new Date();
      item.anuladoPor = this.actorLabel(user);
      item.anuladoMotivo = motivo;
      await repo.save(item);
      return this.findOneWithManager(item.id, user, manager);
    });
  }

  private applyListFilters(
    qb: ReturnType<Repository<GastoComprobante>['createQueryBuilder']>,
    query: QueryGastoDto,
    scopeAserraderoId: number | null,
  ) {
    if (scopeAserraderoId != null) qb.andWhere('g.aserraderoId = :scopeAserraderoId', { scopeAserraderoId });
    if (query?.aserraderoId != null && scopeAserraderoId == null) {
      qb.andWhere('g.aserraderoId = :aserraderoId', { aserraderoId: Number(query.aserraderoId) });
    }
    if (query?.areaId != null) qb.andWhere('g.areaId = :areaId', { areaId: Number(query.areaId) });
    if (query?.proveedorId != null) qb.andWhere('g.proveedorId = :proveedorId', { proveedorId: Number(query.proveedorId) });
    if (query?.estado) qb.andWhere('g.estado = :estado', { estado: String(query.estado).trim().toUpperCase() });
    if (query?.mes != null) qb.andWhere('g.mes = :mes', { mes: Number(query.mes) });
    if (query?.anio != null) qb.andWhere('g.anio = :anio', { anio: Number(query.anio) });
    if (query?.fechaDesde) qb.andWhere('g.fecha >= :fechaDesde', { fechaDesde: String(query.fechaDesde).slice(0, 10) });
    if (query?.fechaHasta) qb.andWhere('g.fecha <= :fechaHasta', { fechaHasta: String(query.fechaHasta).slice(0, 10) });
    if (query?.rubroId != null) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM gastos_lineas glf WHERE glf.gasto_comprobante_id = g.id AND glf.rubro_id = :rubroId)',
        { rubroId: Number(query.rubroId) },
      );
    }
    const q = this.normStr(query?.q);
    if (q) {
      qb.andWhere(
        '(COALESCE(g.proveedorNombre, \'\') ILIKE :q OR COALESCE(g.numeroComprobante, \'\') ILIKE :q OR COALESCE(g.responsable, \'\') ILIKE :q OR COALESCE(g.areaNombre, \'\') ILIKE :q OR COALESCE(g.observaciones, \'\') ILIKE :q)',
        { q: `%${q}%` },
      );
    }
    return qb;
  }

  async findAll(query: QueryGastoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    let scopeAserraderoId: number | null = null;
    if (this.esAdminAsignado(user)) {
      scopeAserraderoId = (await this.resolverAserraderoPorNombre(user.aserradero as string)).id;
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query?.limit) || 50));
    const q = query || ({} as QueryGastoDto);

    const idsQb = this.applyListFilters(this.repo.createQueryBuilder('g'), q, scopeAserraderoId)
      .select(['g.id', 'g.fecha'])
      .orderBy('g.fecha', 'DESC')
      .addOrderBy('g.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [idRows, total] = await idsQb.getManyAndCount();
    const ids = idRows.map((r) => r.id);
    const data = ids.length
      ? await this.repo
          .createQueryBuilder('g')
          .leftJoinAndSelect('g.lineas', 'gl')
          .leftJoinAndSelect('gl.rubro', 'glr')
          .leftJoinAndSelect('g.area', 'area')
          .leftJoinAndSelect('g.proveedor', 'prov')
          .whereInIds(ids)
          .orderBy('g.fecha', 'DESC')
          .addOrderBy('g.id', 'DESC')
          .addOrderBy('gl.orden', 'ASC')
          .addOrderBy('gl.id', 'ASC')
          .getMany()
      : [];

    const totalsRaw = await this.applyListFilters(this.repo.createQueryBuilder('g'), q, scopeAserraderoId)
      .select('COALESCE(SUM(g.subtotalNeto), 0)', 'subtotalNeto')
      .addSelect('COALESCE(SUM(g.ivaMonto), 0)', 'iva')
      .addSelect('COALESCE(SUM(g.otrosTributos), 0)', 'otrosTributos')
      .addSelect('COALESCE(SUM(g.total), 0)', 'total')
      .getRawOne<{ subtotalNeto: string; iva: string; otrosTributos: string; total: string }>();

    return {
      data,
      total,
      page,
      limit,
      totales: {
        subtotalNeto: round2(Number(totalsRaw?.subtotalNeto || 0)),
        iva: round2(Number(totalsRaw?.iva || 0)),
        otrosTributos: round2(Number(totalsRaw?.otrosTributos || 0)),
        total: round2(Number(totalsRaw?.total || 0)),
      },
    };
  }
}
