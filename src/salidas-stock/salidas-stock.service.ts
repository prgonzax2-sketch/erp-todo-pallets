import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SalidaStock } from './entities/salida-stock.entity.js';
import { SalidaStockDetalle } from './entities/salida-stock-detalle.entity.js';
import { CreateSalidaStockDto, ConfirmarBasculaDto } from './dto/salida-stock.dto.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { SubproductoEgreso } from '../conciliacion/entities/subproducto-egreso.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import {
  IVA_DEFAULT,
  calcularLineaFinanciera,
  estadoFacturacionDesde,
  resolverAlicuotaIva,
  round2,
  round3,
  sumarTotales,
  toFinite,
} from './ventas.utils.js';

function isUniqueViolation(err: any): boolean {
  const code = String(err?.code || err?.driverError?.code || '');
  const msg = String(err?.message || err?.driverError?.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

@Injectable()
export class SalidasStockService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SalidaStock)
    private readonly salidaStockRepository: Repository<SalidaStock>,
    @InjectRepository(SalidaStockDetalle)
    private readonly detalleRepo: Repository<SalidaStockDetalle>,
    @InjectRepository(ProduccionEntity)
    private readonly produccionRepository: Repository<ProduccionEntity>,
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
  ) {}

  // ===== correlativo robusto (reemplaza count+1, R1) =====
  async generarNumeroRemitoSeguro(manager: EntityManager): Promise<string> {
    const row = await manager.query(
      `SELECT COALESCE(MAX((regexp_match("numeroRemito", '^REM-([0-9]+)$'))[1]::int), 0) AS maxn FROM salidas_stock WHERE "numeroRemito" ~ '^REM-[0-9]+$'`,
    );
    const maxn = Number(row?.[0]?.maxn || 0);
    return `REM-${String(maxn + 1).padStart(5, '0')}`;
  }

  private async guardarConCorrelativoRetry<T>(
    manager: EntityManager,
    build: (numeroRemito: string) => Promise<T>,
    maxAttempts = 5,
  ): Promise<T> {
    for (let i = 0; i < maxAttempts; i++) {
      const numero = await this.generarNumeroRemitoSeguro(manager);
      try {
        return await build(numero);
      } catch (e: any) {
        if (isUniqueViolation(e) && String(e?.detail || e?.message || '').includes('numeroRemito')) {
          continue;
        }
        throw e;
      }
    }
    throw new ConflictException('No se pudo generar un número de remito único. Reintente.');
  }

  private resolveAserradero(user: AuthenticatedUser, dtoAserradero?: string | null): string {
    const userA = typeof user?.aserradero === 'string' ? user.aserradero.trim() : '';
    const req = typeof dtoAserradero === 'string' ? dtoAserradero.trim() : '';
    if (userA) {
      if (req && req !== userA) throw new BadRequestException('No puede operar otro aserradero.');
      return userA;
    }
    if (!req) throw new BadRequestException('Debes indicar el aserradero de origen del despacho.');
    return req;
  }

  // ===== compat legacy: registrarSalida (A1 best-effort, transaccional, correlativo robusto) =====
  async registrarSalida(dto: CreateSalidaStockDto, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    // Si viene como directa subproducto o con detalles subproducto explícitos, usar flujo A1
    if (dto.origenTipo === 'DIRECTA_SUBPRODUCTO' || (dto.detalles || []).some(d => d.tipoRenglon === 'SUBPRODUCTO')) {
      return this.crearVentaDirectaSubproducto(dto, user);
    }
    // Compat: items legacy => directa madera
    return this.crearVentaDirectaMadera(dto, user);
  }

  async crearVentaDirectaMadera(dto: CreateSalidaStockDto, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const aserradero = this.resolveAserradero(user, dto.aserradero);
    const clienteNombre = dto.clienteNombre?.trim();
    if (!clienteNombre) throw new BadRequestException('Debes indicar el nombre del cliente.');

    const hasLegacy = Array.isArray(dto.items) && dto.items.length > 0;
    const hasDetalles = Array.isArray(dto.detalles) && dto.detalles.length > 0;
    if (!hasLegacy && !hasDetalles) throw new BadRequestException('Debes indicar al menos un ítem/lote para despachar.');

    return this.dataSource.transaction(async (manager) => {
      const cliente = await this.resolverCliente(manager, dto, aserradero, clienteNombre);
      const alicCliente = resolverAlicuotaIva(dto.alicuotaIvaDefault, (cliente as any)?.alicuotaIvaDefault, IVA_DEFAULT);

      type LinePrep = { registro: ProduccionEntity; paquetes: number; piezas: number; p2: number; sepP2: number; tacoP2: number; baseP2: number; legacyItem: any; detalle: Partial<SalidaStockDetalle> };
      const preps: LinePrep[] = [];

      if (hasLegacy) {
        const ids = dto.items!.map(i => i.produccionId);
        const regs = await manager.getRepository(ProduccionEntity).find({ where: { id: In(ids) } });
        for (const itemDto of dto.items!) {
          if (Number(itemDto.paquetesDespachados || 0) <= 0) continue;
          const registro = regs.find(r => r.id === itemDto.produccionId);
          if (!registro) throw new NotFoundException(`El lote/stock #${itemDto.produccionId} no fue encontrado.`);
          if (user.aserradero && registro.aserradero !== user.aserradero) throw new ForbiddenException(`No puedes despachar stock de otro aserradero (${registro.aserradero}).`);
          if (aserradero && registro.aserradero && registro.aserradero !== aserradero) throw new BadRequestException(`El lote ${registro.lote || registro.id} no pertenece al aserradero ${aserradero}.`);

          // lock row
          const locked = await manager.getRepository(ProduccionEntity).findOne({ where: { id: registro.id } as any, lock: { mode: 'pessimistic_write' } as any });
          if (!locked) throw new NotFoundException(`Stock #${registro.id} no encontrado.`);
          const disponible = Math.max(0, toFinite(locked.cantidadPaquetes) - toFinite(locked.cantidadReservada));
          const paq = toFinite(itemDto.paquetesDespachados);
          if (paq > disponible + 1e-9) throw new BadRequestException(`Stock insuficiente para el lote ${locked.lote || locked.id}. Disponible: ${round3(disponible)} paq, solicitado: ${round3(paq)} paq.`);

          locked.cantidadPaquetes = Math.max(0, round3(toFinite(locked.cantidadPaquetes) - paq));
          await manager.getRepository(ProduccionEntity).save(locked);

          const piezasPorPaquete = toFinite(locked.piezasPorPaquete);
          const piezas = itemDto.piezasDespachadas != null ? toFinite(itemDto.piezasDespachadas) : paq * piezasPorPaquete;
          const esp = toFinite(locked.espesor), anc = toFinite(locked.ancho), lar = toFinite(locked.largo);
          const baseP2 = (piezas * esp * anc * lar * 424) / 1_000_000_000;
          const calcComp = (arr: any[]) => (arr || []).reduce((sum: number, comp: any) => {
            const cant = paq * toFinite(comp?.cantidad);
            const m = comp?.medida || {};
            return sum + (cant * toFinite(m.espesor) * toFinite(m.ancho) * toFinite(m.largo) * 424) / 1_000_000_000;
          }, 0);
          const sepP2 = calcComp(locked.separadores as any);
          const tacoP2 = calcComp(locked.tacos as any);
          const itemP2 = round3(baseP2 + sepP2 + tacoP2);
          const fin = calcularLineaFinanciera({ unidadPrecio: itemDto.unidadPrecio || 'P2', precioUnitario: itemDto.precioUnitario ?? 0, alicuotaIva: resolverAlicuotaIva(itemDto.alicuotaIva, alicCliente, IVA_DEFAULT), p2: itemP2, cantidad: paq });
          const legacyItem = {
            produccionId: locked.id,
            lote: locked.lote || `L-${locked.id}`,
            aserradero: locked.aserradero,
            producto: locked.descripcionProducto || locked.tipoProducto,
            especie: locked.especie,
            espesor: esp, ancho: anc, largo: lar,
            unidadDimensiones: locked.unidadDimensiones || 'MILIMETROS',
            paquetesDespachados: paq,
            piezasPorPaquete,
            piezasDespachadas: piezas,
            separadores: locked.separadores || [],
            tacos: locked.tacos || [],
            p2Base: round3(baseP2), p2Separadores: round3(sepP2), p2Tacos: round3(tacoP2), p2: itemP2,
            medidaRemito: itemDto.medidaRemito,
            ...fin,
          };
          preps.push({ registro: locked, paquetes: paq, piezas, p2: itemP2, sepP2, tacoP2, baseP2, legacyItem, detalle: {
            tipoRenglon: 'MADERA_PAQUETE', produccionId: locked.id, productoTipo: locked.tipoProducto || null,
            productoEspecie: locked.especie || null, detalle: locked.descripcionProducto || null,
            medidaTexto: itemDto.medidaRemito || `${esp}x${anc}x${lar}`,
            espesorReal: esp, anchoReal: anc, largoReal: lar,
            cantidad: paq, piezas, p2: itemP2, unidadPrecio: itemDto.unidadPrecio || 'P2', ...fin,
          }});
        }
      }

      // A1 detalles madera (normalizados) sin legacy items: también descuenta
      if (!hasLegacy && hasDetalles) {
        const dets = (dto.detalles || []).filter(d => d.tipoRenglon !== 'SUBPRODUCTO');
        for (const d of dets) {
          if (!d.produccionId) throw new BadRequestException('Cada renglón de madera directa requiere produccionId.');
          const locked = await manager.getRepository(ProduccionEntity).findOne({ where: { id: d.produccionId } as any, lock: { mode: 'pessimistic_write' } as any });
          if (!locked) throw new NotFoundException(`Stock #${d.produccionId} no encontrado.`);
          if (aserradero && locked.aserradero && locked.aserradero !== aserradero) throw new BadRequestException(`Lote ${locked.id} no pertenece al aserradero ${aserradero}.`);
          const paq = Math.max(0, toFinite(d.cantidad));
          if (paq <= 0) continue;
          const disponible = Math.max(0, toFinite(locked.cantidadPaquetes) - toFinite(locked.cantidadReservada));
          if (paq > disponible + 1e-9) throw new BadRequestException(`Stock insuficiente para el lote ${locked.lote || locked.id}. Disponible: ${round3(disponible)}.`);
          locked.cantidadPaquetes = Math.max(0, round3(toFinite(locked.cantidadPaquetes) - paq));
          await manager.getRepository(ProduccionEntity).save(locked);
          const piezasPorPaquete = toFinite(locked.piezasPorPaquete);
          const piezas = d.piezas != null ? toFinite(d.piezas) : paq * piezasPorPaquete;
          const esp = toFinite(locked.espesor), anc = toFinite(locked.ancho), lar = toFinite(locked.largo);
          const baseP2 = (piezas * esp * anc * lar * 424) / 1_000_000_000;
          const calcComp = (arr: any[]) => (arr || []).reduce((sum: number, comp: any) => {
            const cant = paq * toFinite(comp?.cantidad); const m = comp?.medida || {};
            return sum + (cant * toFinite(m.espesor) * toFinite(m.ancho) * toFinite(m.largo) * 424) / 1_000_000_000;
          }, 0);
          const itemP2 = round3(baseP2 + calcComp(locked.separadores as any) + calcComp(locked.tacos as any));
          const fin = calcularLineaFinanciera({ unidadPrecio: d.unidadPrecio || 'P2', precioUnitario: d.precioUnitario ?? 0, alicuotaIva: resolverAlicuotaIva(d.alicuotaIva, alicCliente, IVA_DEFAULT), p2: itemP2, cantidad: paq, m2: d.m2 });
          preps.push({ registro: locked, paquetes: paq, piezas, p2: itemP2, sepP2: 0, tacoP2: 0, baseP2, legacyItem: { produccionId: locked.id, lote: locked.lote || `L-${locked.id}`, paquetesDespachados: paq, piezasDespachadas: piezas, p2: itemP2, ...fin }, detalle: { tipoRenglon: 'MADERA_PAQUETE', produccionId: locked.id, productoEspecie: locked.especie || null, detalle: d.detalle || locked.descripcionProducto || null, medidaTexto: d.medidaTexto || `${esp}x${anc}x${lar}`, espesorReal: esp, anchoReal: anc, largoReal: lar, cantidad: paq, piezas, p2: itemP2, m2: d.m2 ?? null, unidadPrecio: d.unidadPrecio || 'P2', ...fin } });
        }
      }

      if (preps.length === 0) throw new BadRequestException('No hay ítems válidos para despachar (cantidad 0).');

      const totF = sumarTotales(preps.map(p => p.detalle as any));
      const fecha = dto.fecha?.trim() || new Date().toISOString().slice(0, 10);
      const estadoFacturacion = estadoFacturacionDesde(dto.facturaNumero, dto.tipoComprobante);

      const salida = await this.guardarConCorrelativoRetry(manager, async (numeroRemito) => {
        const s = manager.getRepository(SalidaStock).create({
          numeroRemito,
          fecha,
          aserradero,
          clienteId: cliente?.id ?? null,
          clienteNombre: cliente?.nombre || clienteNombre,
          clienteCuitDni: (cliente as any)?.cuitDni || dto.clienteCuitDni || null,
          clienteTelefono: (cliente as any)?.telefono || dto.telefono || null,
          clienteDireccion: (cliente as any)?.direccion || dto.direccion || null,
          cantidadSolicitada: toFinite(dto.cantidadSolicitada),
          medidaSolicitada: dto.medidaSolicitada?.trim() || null,
          totalPaquetesDespachados: round3(preps.reduce((a, p) => a + p.paquetes, 0)),
          totalPiezasDespachadas: round3(preps.reduce((a, p) => a + p.piezas, 0)),
          totalP2Despachado: round3(preps.reduce((a, p) => a + p.p2, 0)),
          observaciones: dto.observaciones?.trim() || null,
          items: preps.map(p => p.legacyItem), // compat dual-write
          estado: 'CONFIRMADA',
          creadoPor: user.email || user.rol || null,
          // A1
          remitoFisicoNumero: dto.remitoFisicoNumero?.trim() || null,
          tipoComprobante: dto.tipoComprobante?.trim() || null,
          facturaNumero: dto.facturaNumero?.trim() || null,
          estadoFacturacion,
          transporte: dto.transporte?.trim() || null,
          origenTipo: 'DIRECTA_MADERA',
          estadoDespacho: 'CONFIRMADO',
          moneda: 'ARS',
          subtotalNeto: totF.subtotalNeto,
          ivaMonto: totF.ivaMonto,
          total: totF.total,
          toneladasTotal: totF.tnTotal || null,
          m2Total: totF.m2Total || null,
          basculaPendiente: false,
          facturadoAt: estadoFacturacion === 'FACTURADO' ? new Date() : null,
          usuario: user.email || null,
        } as any) as unknown as SalidaStock;
        return manager.getRepository(SalidaStock).save(s);
      });

      const detRepo = manager.getRepository(SalidaStockDetalle);
      const detalles: SalidaStockDetalle[] = [];
      for (const p of preps) {
        const d = detRepo.create({ ...(p.detalle as any), salidaStockId: salida.id } as any) as unknown as SalidaStockDetalle;
        detalles.push(await detRepo.save(d));
      }
      return { ...salida, detalles, items: preps.map(p => p.legacyItem) };
    });
  }

  async crearVentaDirectaSubproducto(dto: CreateSalidaStockDto, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const aserradero = this.resolveAserradero(user, dto.aserradero);
    const clienteNombre = dto.clienteNombre?.trim();
    if (!clienteNombre) throw new BadRequestException('Debes indicar el nombre del cliente.');
    const dets = (dto.detalles || []).filter(d => d.tipoRenglon === 'SUBPRODUCTO' || d.subproductoTipo);
    if (dets.length === 0) throw new BadRequestException('Debes indicar al menos un renglón de subproducto (CHIP/ASERRÍN).');

    return this.dataSource.transaction(async (manager) => {
      const cliente = await this.resolverCliente(manager, dto, aserradero, clienteNombre);
      const alicCliente = resolverAlicuotaIva(dto.alicuotaIvaDefault, (cliente as any)?.alicuotaIvaDefault, IVA_DEFAULT);
      const pendienteBascula = !!dto.pendienteBascula || dets.some(d => d.tnProvisionales == null);
      const fecha = dto.fecha?.trim() || new Date().toISOString().slice(0, 10);
      const estadoFacturacion = estadoFacturacionDesde(dto.facturaNumero, dto.tipoComprobante);

      const detallePreps = dets.map((d) => {
        const tnProv = d.tnProvisionales != null ? Math.max(0, toFinite(d.tnProvisionales)) : (d.toneladas != null ? Math.max(0, toFinite(d.toneladas)) : null);
        const tnBase = tnProv ?? 0;
        const fin = calcularLineaFinanciera({ unidadPrecio: 'TN', precioUnitario: d.precioUnitario ?? 0, alicuotaIva: resolverAlicuotaIva(d.alicuotaIva, alicCliente, IVA_DEFAULT), tnProvisionales: tnBase, cantidad: d.cantidad ?? 1 });
        return {
          tipoRenglon: 'SUBPRODUCTO',
          productoTipo: d.subproductoTipo || 'SUBPRODUCTO',
          productoEspecie: d.especieDeclarada || d.productoEspecie || 'MEZCLA',
          detalle: d.detalle || `${d.subproductoTipo || 'SUBPRODUCTO'} ${d.especieDeclarada || ''}`.trim(),
          medidaTexto: d.medidaTexto || 'TN',
          cantidad: Math.max(1, toFinite(d.cantidad, 1)),
          p2: 0,
          toneladas: tnBase,
          tnProvisionales: tnProv,
          tnReales: null,
          unidadPrecio: 'TN',
          estadoLinea: pendienteBascula || tnProv == null ? 'PENDIENTE_BASCULA' : 'CONFIRMADO',
          observaciones: d.observaciones || null,
          ...fin,
        } as Partial<SalidaStockDetalle>;
      });

      const totF = sumarTotales(detallePreps as any[]);
      const salida = await this.guardarConCorrelativoRetry(manager, async (numeroRemito) => {
        const s = manager.getRepository(SalidaStock).create({
          numeroRemito, fecha, aserradero,
          clienteId: cliente?.id ?? null, clienteNombre: cliente?.nombre || clienteNombre,
          clienteCuitDni: (cliente as any)?.cuitDni || dto.clienteCuitDni || null,
          clienteTelefono: (cliente as any)?.telefono || dto.telefono || null,
          clienteDireccion: (cliente as any)?.direccion || dto.direccion || null,
          cantidadSolicitada: toFinite(dto.cantidadSolicitada, totF.cantTotal),
          medidaSolicitada: dto.medidaSolicitada?.trim() || 'TN',
          totalPaquetesDespachados: 0, totalPiezasDespachadas: 0, totalP2Despachado: 0,
          observaciones: dto.observaciones?.trim() || null,
          items: detallePreps.map(d => ({ tipo: 'SUBPRODUCTO', producto: d.productoTipo, especie: d.productoEspecie, toneladas: d.toneladas, tnProvisionales: d.tnProvisionales, ...((({importeNeto,ivaMonto,total,precioUnitario,alicuotaIva,unidadPrecio}:any)=>({importeNeto,ivaMonto,total,precioUnitario,alicuotaIva,unidadPrecio}))(d)) })),
          estado: 'CONFIRMADA', creadoPor: user.email || user.rol || null,
          remitoFisicoNumero: dto.remitoFisicoNumero?.trim() || null,
          tipoComprobante: dto.tipoComprobante?.trim() || null,
          facturaNumero: dto.facturaNumero?.trim() || null,
          estadoFacturacion, transporte: dto.transporte?.trim() || null,
          origenTipo: 'DIRECTA_SUBPRODUCTO',
          estadoDespacho: pendienteBascula ? 'PENDIENTE_BASCULA' : 'CONFIRMADO',
          moneda: 'ARS', subtotalNeto: totF.subtotalNeto, ivaMonto: totF.ivaMonto, total: totF.total,
          toneladasTotal: totF.tnTotal || null, m2Total: null,
          basculaPendiente: pendienteBascula, facturadoAt: estadoFacturacion === 'FACTURADO' ? new Date() : null,
          usuario: user.email || null,
        } as any) as unknown as SalidaStock;
        return manager.getRepository(SalidaStock).save(s);
      });

      const detRepo = manager.getRepository(SalidaStockDetalle);
      const detalles: SalidaStockDetalle[] = [];
      for (const dp of detallePreps) {
        detalles.push(await detRepo.save(detRepo.create({ ...(dp as any), salidaStockId: salida.id } as any) as unknown as SalidaStockDetalle));
      }
      return { ...salida, detalles };
    });
  }

  private async resolverCliente(manager: EntityManager, dto: CreateSalidaStockDto, aserradero: string, clienteNombre: string): Promise<Cliente | null> {
    let cliente: Cliente | null = null;
    const cRepo = manager.getRepository(Cliente);
    if (dto.clienteId) cliente = await cRepo.findOne({ where: { id: dto.clienteId } as any });
    if (!cliente) cliente = await cRepo.findOne({ where: { nombre: clienteNombre, activo: true } as any });
    if (!cliente) {
      cliente = (await cRepo.save(cRepo.create({
        nombre: clienteNombre,
        cuitDni: dto.clienteCuitDni?.trim() || null,
        telefono: dto.telefono?.trim() || null,
        direccion: dto.direccion?.trim() || null,
        aserradero,
        activo: true,
      } as any) as any)) as unknown as Cliente;
    }
    return cliente;
  }

  // ===== queries =====
  async listarSalidas(query: any, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const aserraderoFiltro = user.aserradero || String(query.aserradero || '').trim();
    const qb = this.salidaStockRepository.createQueryBuilder('salida').leftJoinAndSelect('salida.detalles', 'det');
    if (aserraderoFiltro) qb.andWhere('salida.aserradero = :aserradero', { aserradero: aserraderoFiltro });
    if (query.cliente) qb.andWhere('LOWER(salida.clienteNombre) LIKE :cliente', { cliente: `%${String(query.cliente).toLowerCase()}%` });
    if (query.clienteId) qb.andWhere('salida.clienteId = :clienteId', { clienteId: Number(query.clienteId) });
    if (query.fechaDesde || query.desde) qb.andWhere('salida.fecha >= :fechaDesde', { fechaDesde: query.fechaDesde || query.desde });
    if (query.fechaHasta || query.hasta) qb.andWhere('salida.fecha <= :fechaHasta', { fechaHasta: query.fechaHasta || query.hasta });
    if (query.estadoFacturacion) qb.andWhere('salida.estadoFacturacion = :ef', { ef: String(query.estadoFacturacion) });
    if (query.estadoDespacho) qb.andWhere('salida.estadoDespacho = :ed', { ed: String(query.estadoDespacho) });
    if (query.origenTipo) qb.andWhere('salida.origenTipo = :ot', { ot: String(query.origenTipo) });
    qb.orderBy('salida.id', 'DESC');
    const data = await qb.getMany();
    const totales = sumarTotales(data.map((s: any) => ({
      importeNeto: s.subtotalNeto, ivaMonto: s.ivaMonto, total: s.total,
      p2: s.totalP2Despachado, toneladas: s.toneladasTotal, cantidad: s.totalPaquetesDespachados, m2: s.m2Total,
    })));
    return { data, totales: { ...totales, registros: data.length } };
  }

  async obtenerSalida(id: number, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const salida = await this.salidaStockRepository.findOne({ where: { id } as any, relations: { detalles: true } as any });
    if (!salida) throw new NotFoundException(`Remito / Salida #${id} no encontrado.`);
    if (user.aserradero && salida.aserradero !== user.aserradero) throw new ForbiddenException('No tienes acceso a los remitos de otro aserradero.');
    return salida;
  }

  async anularSalida(id: number, user: AuthenticatedUser, motivo?: string) {
    this.validarAdministrador(user);
    const salida = await this.obtenerSalida(id, user);
    if (salida.estado === 'ANULADA' || salida.estadoDespacho === 'ANULADO') throw new BadRequestException('Esta salida ya se encuentra anulada.');
    if (salida.estadoFacturacion === 'FACTURADO') throw new BadRequestException('No se puede anular una venta facturada (v1). Realice el ajuste contable correspondiente.');
    // D-SP4 (excepción acotada): permite anular pedido-subproducto provisional (camión cancelado antes de salir)
    // SOLO si PENDIENTE_BASCULA (o basculaPendiente) y NO FACTURADO. Resto de casos PEDIDO siguen bloqueados.
    const isPedidoOrigin = salida.origenTipo === 'PEDIDO' || !!salida.pedidoId;
    const allowPedidoProvisionalAnnul =
      isPedidoOrigin &&
      (salida.estadoDespacho === 'PENDIENTE_BASCULA' || !!salida.basculaPendiente) &&
      salida.estadoFacturacion !== 'FACTURADO';
    if (isPedidoOrigin && !allowPedidoProvisionalAnnul) {
      throw new BadRequestException('No se puede anular una venta emitida desde Pedido (v1). Use el flujo de anulación de despacho/pedido cuando esté habilitado.');
    }

    return this.dataSource.transaction(async (manager) => {
      // D-SP4: si el provisional tenía egresos vinculados (inusual), eliminarlos/desvincular en la misma tx
      if (allowPedidoProvisionalAnnul) {
        const detalles = (salida.detalles || []) as any[];
        const egIds = detalles.map((d) => d?.subproductoEgresoId).filter((v): v is number => v != null);
        if (egIds.length) {
          const egRepo = manager.getRepository(SubproductoEgreso);
          await egRepo.delete({ id: In(egIds) } as any);
          const detRepo = manager.getRepository(SalidaStockDetalle);
          for (const det of detalles) {
            if (det?.subproductoEgresoId != null) {
              det.subproductoEgresoId = null;
              await detRepo.save(det);
            }
          }
        }
      }

      // Reintegrar stock físico solo para madera directa/legacy con items (subproducto provisional no tiene produccionId)
      for (const item of salida.items || []) {
        const prodId = item.produccionId || item.produccion_id;
        const paq = Number(item.paquetesDespachados || item.paquetes || 0);
        if (!prodId || paq <= 0) continue;
        const registro = await manager.getRepository(ProduccionEntity).findOne({ where: { id: prodId } as any, lock: { mode: 'pessimistic_write' } as any });
        if (registro) {
          registro.cantidadPaquetes = round3(Math.max(0, toFinite(registro.cantidadPaquetes) + paq));
          await manager.getRepository(ProduccionEntity).save(registro);
        }
      }
      salida.estado = 'ANULADA';
      salida.estadoDespacho = 'ANULADO';
      salida.anuladoMotivo = (motivo || '').trim() || null;
      salida.anuladoAt = new Date();
      return manager.getRepository(SalidaStock).save(salida);
    });
  }

  async buscarStockPorMedida(query: any, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const aserradero = user.aserradero || String(query.aserradero || '').trim();
    const especie = String(query.especie || '').trim();
    const espesorBuscado = Number(query.espesor);
    const anchoBuscado = Number(query.ancho);
    const largoBuscado = Number(query.largo);
    if (!Number.isFinite(espesorBuscado) || !Number.isFinite(anchoBuscado) || !Number.isFinite(largoBuscado)) {
      throw new BadRequestException('Debes indicar espesor, ancho y largo válidos para buscar stock.');
    }
    const margenEspesor = 2;
    const registros = await this.produccionRepository.find();
    let producciones = aserradero ? registros.filter(record => record.aserradero === aserradero) : registros;
    const coincideDimensiones = (registro: any) => {
      const esp = Number(registro.espesor || 0); const anc = Number(registro.ancho || 0); const lar = Number(registro.largo || 0);
      return Math.abs(esp - espesorBuscado) <= margenEspesor && anc === anchoBuscado && lar === largoBuscado;
    };
    return producciones
      .filter(registro => Number(registro.cantidadPaquetes || 0) > 0 && (!especie || String(registro.especie || '').toLowerCase().includes(especie.toLowerCase())) && coincideDimensiones(registro))
      .map(registro => ({
        id: registro.id, lote: registro.lote || `L-${registro.id}`, aserradero: registro.aserradero,
        producto: registro.descripcionProducto || registro.tipoProducto, especie: registro.especie,
        espesor: Number(registro.espesor), ancho: Number(registro.ancho), largo: Number(registro.largo),
        unidadDimensiones: registro.unidadDimensiones || 'MILIMETROS',
        piezasPorPaquete: Number(registro.piezasPorPaquete || 0),
        paquetesDisponibles: Number(registro.cantidadPaquetes || 0),
        piezasDisponibles: Number(registro.cantidadPaquetes || 0) * Number(registro.piezasPorPaquete || 0),
        separadores: registro.separadores || [], tacos: registro.tacos || [],
      }));
  }

  async buscarStockParaDespacho(query: any, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const aserradero = user.aserradero || String(query.aserradero || '').trim();
    const especie = String(query.especie || '').trim();
    const espesorBuscado = Number(query.espesor);
    const anchoBuscado = Number(query.ancho);
    const largoBuscado = Number(query.largo);
    if (!Number.isFinite(espesorBuscado) || !Number.isFinite(anchoBuscado) || !Number.isFinite(largoBuscado)) {
      throw new BadRequestException('Debes indicar espesor, ancho y largo válidos para buscar stock.');
    }
    const margenEspesor = 2;
    const registros = await this.produccionRepository.find();
    let producciones = aserradero ? registros.filter(record => record.aserradero === aserradero) : registros;
    const coincideDimensiones = (registro: any) => {
      const esp = Number(registro.espesor || 0); const anc = Number(registro.ancho || 0); const lar = Number(registro.largo || 0);
      return Math.abs(esp - espesorBuscado) <= margenEspesor && anc === anchoBuscado && lar === largoBuscado;
    };
    return producciones
      .filter(registro => Math.max(0, Number(registro.cantidadPaquetes || 0) - Number(registro.cantidadReservada || 0)) > 0 && (!especie || String(registro.especie || '').toLowerCase().includes(especie.toLowerCase())) && coincideDimensiones(registro))
      .map(registro => {
        const disp = Math.max(0, Number(registro.cantidadPaquetes || 0) - Number(registro.cantidadReservada || 0));
        return ({
          id: registro.id, lote: registro.lote || `L-${registro.id}`, aserradero: registro.aserradero,
          producto: registro.descripcionProducto || registro.tipoProducto, especie: registro.especie,
          espesor: Number(registro.espesor), ancho: Number(registro.ancho), largo: Number(registro.largo),
          unidadDimensiones: registro.unidadDimensiones || 'MILIMETROS',
          piezasPorPaquete: Number(registro.piezasPorPaquete || 0),
          paquetesDisponibles: disp, cantidadReservada: Math.max(0, Number(registro.cantidadReservada || 0)),
          piezasDisponibles: disp * Number(registro.piezasPorPaquete || 0),
          separadores: registro.separadores || [], tacos: registro.tacos || [],
        });
      });
  }

  /**
   * V3 Báscula: confirma TN reales de subproducto, recalcula BE y crea/vincula SubproductoEgreso (tx).
   * Decisión 4: si FACTURADO, bloquea confirmación que altere totales.
   */
  private validarAdministrador(user: AuthenticatedUser) {
    if (user?.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar salidas de stock.');
  }

  async confirmarBascula(id: number, dto: ConfirmarBasculaDto, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    if (!dto?.lineas?.length) throw new BadRequestException('Debes indicar las líneas con TN reales de báscula.');

    return this.dataSource.transaction(async (manager) => {
      const salRepo = manager.getRepository(SalidaStock);
      const detRepo = manager.getRepository(SalidaStockDetalle);
      const egRepo = manager.getRepository(SubproductoEgreso);

      const salida = await salRepo.findOne({ where: { id } as any });
      if (!salida) throw new NotFoundException(`Salida #${id} no encontrada.`);
      if (user.aserradero && salida.aserradero !== user.aserradero) throw new ForbiddenException('No tienes acceso a esta salida.');
      if (salida.estado === 'ANULADA' || salida.estadoDespacho === 'ANULADO') throw new BadRequestException('La salida está anulada.');
      if (salida.origenTipo !== 'DIRECTA_SUBPRODUCTO' && !salida.basculaPendiente) {
        // allow only if it actually has subproducto pending lines
      }

      // D-SP5: cabecera opcional (back-compat). Trim; string vacía => null.
      // Se aplica antes del loop de egresos para que la referencia refleje valores efectivos.
      const normCab = (v: string | undefined) => (v === undefined ? undefined : (String(v).trim() || null));
      const cabRemitoFisico = normCab(dto.remitoFisicoNumero);
      const cabTipoComprobante = normCab(dto.tipoComprobante);
      const cabFacturaNumero = normCab(dto.facturaNumero);
      if (cabRemitoFisico !== undefined) salida.remitoFisicoNumero = cabRemitoFisico;
      if (cabTipoComprobante !== undefined) salida.tipoComprobante = cabTipoComprobante;
      if (cabFacturaNumero !== undefined) salida.facturaNumero = cabFacturaNumero;
      const estadoFacturacionAntes = salida.estadoFacturacion;
      salida.estadoFacturacion = estadoFacturacionDesde(salida.facturaNumero, salida.tipoComprobante);

      const detalles = await detRepo.find({ where: { salidaStockId: id } as any });
      if (!detalles.length) throw new BadRequestException('La salida no tiene detalles.');

      // simulate totals change if FACTURADO (estado previo). D-SP6: precio/TN definitivo actualiza precioUnitario.
      const totalAntes = round2(toFinite(salida.total));
      const cambios: Array<{
        detalle: SalidaStockDetalle;
        tnReales: number;
        finNuevo: any;
        deltaTn: number;
        deltaTotal: number;
        effectivePrice: number;
        linePrecioPorTn: number | null;
      }> = [];
      for (const l of dto.lineas) {
        const det = detalles.find((d) => d.id === l.detalleId);
        if (!det) throw new NotFoundException(`Detalle #${l.detalleId} no pertenece a la salida.`);
        if (det.tipoRenglon !== 'SUBPRODUCTO') throw new BadRequestException(`Detalle #${l.detalleId} no es SUBPRODUCTO.`);
        const tnReales = Math.max(0, toFinite(l.tnReales));
        const linePrecioPorTn = l.precioPorTn != null ? Math.max(0, toFinite(l.precioPorTn)) : null;
        const effectivePrice = linePrecioPorTn != null ? linePrecioPorTn : toFinite(det.precioUnitario);
        const finNuevo = calcularLineaFinanciera({
          unidadPrecio: 'TN',
          precioUnitario: effectivePrice,
          alicuotaIva: det.alicuotaIva,
          tnReales,
        });
        const tnAntes = toFinite(det.tnReales ?? det.tnProvisionales ?? det.toneladas);
        const deltaTn = round3(tnReales - tnAntes);
        const deltaTotal = round2(finNuevo.total - toFinite(det.total));
        cambios.push({ detalle: det, tnReales, finNuevo, deltaTn, deltaTotal, effectivePrice, linePrecioPorTn });
      }
      const totalNuevoSim = round2(
        detalles.reduce((acc, d) => {
          const c = cambios.find((x) => x.detalle.id === d.id);
          return acc + (c ? toFinite(c.finNuevo.total) : toFinite(d.total));
        }, 0),
      );
      if (estadoFacturacionAntes === 'FACTURADO' && Math.abs(totalNuevoSim - totalAntes) > 0.009) {
        throw new BadRequestException(`No se puede confirmar báscula: la salida está FACTURADA y los totales cambiarían (${totalAntes} → ${totalNuevoSim}). Realice ajuste manual.`);
      }

      const fecha = salida.fecha || new Date().toISOString().slice(0, 10);
      for (const c of cambios) {
        const det = c.detalle;
        const tnAntes = toFinite(det.tnReales ?? det.tnProvisionales ?? det.toneladas);
        det.tnReales = c.tnReales;
        det.toneladas = c.tnReales;
        // D-SP6: precio definitivo
        det.precioUnitario = c.effectivePrice;
        det.cantidadBase = c.finNuevo.cantidadBase;
        det.importeNeto = c.finNuevo.importeNeto;
        det.ivaMonto = c.finNuevo.ivaMonto;
        det.total = c.finNuevo.total;
        det.estadoLinea = 'CONFIRMADO';

        // D-SP5 upsert: si existe subproductoEgresoId, actualizar egreso existente (sin duplicar)
        const tipo = String(det.productoTipo || 'CHIP').toUpperCase() === 'ASERRIN' ? 'ASERRIN' : 'CHIP';
        const tnEstimadas = Math.max(0.001, toFinite(det.tnProvisionales, c.tnReales) || c.tnReales || 0.001);
        const egData = {
          aserradero: salida.aserradero,
          tipo,
          fecha: fecha.slice(0, 10),
          especieDeclarada: (det.productoEspecie || 'MEZCLA').toUpperCase() as any,
          tnEstimadas,
          tnReales: c.tnReales,
          precioPorTn: c.linePrecioPorTn != null ? c.linePrecioPorTn : ((det as any).precioPorTn ?? c.effectivePrice ?? null),
          estado: Math.abs(tnEstimadas - c.tnReales) < 0.0005 ? 'CONFIRMADO' : 'AJUSTADO',
          referencia: `${salida.numeroRemito}${salida.remitoFisicoNumero ? '/' + salida.remitoFisicoNumero : ''}${salida.facturaNumero ? ' FAC:' + salida.facturaNumero : ''}`,
          observaciones: `Báscula salida #${salida.id} det#${det.id}. ΔTN=${c.deltaTn} (antes ${tnAntes}→${c.tnReales}), Δ$=${c.deltaTotal}. ${dto.referencia || dto.motivo || ''}`.trim(),
          usuario: user.email || null,
        } as any;
        let eg: SubproductoEgreso | null = null;
        if (det.subproductoEgresoId != null) {
          eg = await egRepo.findOne({ where: { id: det.subproductoEgresoId } as any });
          if (eg) {
            Object.assign(eg, egData);
          }
        }
        if (!eg) {
          eg = egRepo.create(egData) as unknown as SubproductoEgreso;
        }
        const egSaved = (await egRepo.save(eg)) as unknown as SubproductoEgreso;
        det.subproductoEgresoId = egSaved.id;
        await detRepo.save(det);
      }

      const allDetalles = await detRepo.find({ where: { salidaStockId: id } as any });
      const totF = sumarTotales(allDetalles as any[]);
      salida.subtotalNeto = totF.subtotalNeto;
      salida.ivaMonto = totF.ivaMonto;
      salida.total = totF.total;
      salida.toneladasTotal = totF.tnTotal || null;
      salida.basculaPendiente = allDetalles.some((d) => d.tipoRenglon === 'SUBPRODUCTO' && d.estadoLinea === 'PENDIENTE_BASCULA');
      salida.estadoDespacho = salida.basculaPendiente ? 'PENDIENTE_BASCULA' : 'CONFIRMADO';
      if (!salida.basculaPendiente) salida.basculaConfirmadaAt = new Date();
      if (salida.estadoFacturacion === 'FACTURADO' && !salida.facturadoAt) salida.facturadoAt = new Date();
      // dual-write items
      salida.items = allDetalles.map((d) => ({ tipo: d.tipoRenglon, producto: d.productoTipo, especie: d.productoEspecie, toneladas: d.tnReales ?? d.toneladas, tnProvisionales: d.tnProvisionales, tnReales: d.tnReales, importeNeto: d.importeNeto, ivaMonto: d.ivaMonto, total: d.total, precioUnitario: d.precioUnitario, alicuotaIva: d.alicuotaIva, subproductoEgresoId: d.subproductoEgresoId }));
      await salRepo.save(salida);
      return { ...salida, detalles: allDetalles, totales: totF, basculaConfirmada: !salida.basculaPendiente };
    });
  }

}
