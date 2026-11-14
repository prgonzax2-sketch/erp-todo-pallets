import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Pedido } from './entities/pedido.entity.js';
import { PedidoItem } from './entities/pedido-item.entity.js';
import { PedidoAsignacion } from './entities/pedido-asignacion.entity.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { SalidaStock } from '../salidas-stock/entities/salida-stock.entity.js';
import { SalidaStockDetalle } from '../salidas-stock/entities/salida-stock-detalle.entity.js';
import { SubproductoEgreso } from '../conciliacion/entities/subproducto-egreso.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CreatePedidoDto, CrearAsignacionDto, EmitirDespachoDto, EmitirRemitoSubproductoDto } from './dto/pedido.dto.js';
import { TOLERANCIA_MM, calcularP2Asignacion, matchEspecieOpcional, matchMedidaTolerante, ordenarCandidatosTolerantes, round3 } from './pedidos.utils.js';
import { IVA_DEFAULT, calcularLineaFinanciera, estadoFacturacionDesde, resolverAlicuotaIva, sumarTotales, toFinite } from '../salidas-stock/ventas.utils.js';

const ESTADOS_ASIGNACION_ACTIVA = ['RESERVADA', 'SOLICITADA_INTER', 'AUTORIZADA_INTER', 'PENDIENTE_RETIRO_INTER'];

function isUniqueViolation(err: any): boolean {
  const code = String(err?.code || err?.driverError?.code || '');
  return code === '23505';
}

@Injectable()
export class PedidosService {
  constructor(
    @InjectRepository(Pedido) private readonly pedidoRepo: Repository<Pedido>,
    @InjectRepository(PedidoItem) private readonly itemRepo: Repository<PedidoItem>,
    @InjectRepository(PedidoAsignacion) private readonly asignacionRepo: Repository<PedidoAsignacion>,
    @InjectRepository(ProduccionEntity) private readonly produccionRepo: Repository<ProduccionEntity>,
    @InjectRepository(Cliente) private readonly clienteRepo: Repository<Cliente>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private validarAdmin(user: AuthenticatedUser) {
    if (user?.rol !== 'admin') throw new ForbiddenException('Solo administradores pueden gestionar pedidos.');
  }

  private async generarNumeroPedido(): Promise<string> {
    // F1: simple robusto (intenta con conteo+retry en create via unique). F2.1 reemplaza por secuencia/lock.
    for (let i = 0; i < 5; i++) {
      const total = await this.pedidoRepo.count();
      const n = `PED-${String(total + 1 + i).padStart(5, '0')}`;
      const exists = await this.pedidoRepo.findOneBy({ numeroPedido: n } as any);
      if (!exists) return n;
    }
    return `PED-${Date.now()}`;
  }

  async crear(dto: CreatePedidoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const aserradero = user.aserradero || dto.aserradero?.trim();
    if (!aserradero) throw new BadRequestException('Debes indicar el aserradero del pedido.');
    if (!dto.clienteNombre?.trim()) throw new BadRequestException('Debes indicar el cliente.');
    if (!Array.isArray(dto.items) || dto.items.length === 0) throw new BadRequestException('Debes indicar al menos un renglón.');
    for (const it of dto.items) {
      const tipo = String((it as any).tipoProducto || 'MADERA').toUpperCase();
      if (tipo === 'SUBPRODUCTO') {
        const sub = String((it as any).subproductoTipo || '').toUpperCase();
        if (!['ASERRIN', 'CHIP'].includes(sub)) {
          throw new BadRequestException('Cada renglón de subproducto debe indicar tipo ASERRIN o CHIP.');
        }
        if (!Number.isFinite(Number((it as any).tnEstimada)) || Number((it as any).tnEstimada) <= 0) {
          throw new BadRequestException('Cada renglón de subproducto debe indicar tnEstimada mayor a 0.');
        }
      } else {
        if (![it.espesorSolicitado, it.anchoSolicitado, it.largoSolicitado].every(n => Number.isFinite(Number(n)) && Number(n) > 0)) {
          throw new BadRequestException('Cada renglón de madera debe tener espesor, ancho y largo válidos (las 3 dimensiones).');
        }
        if (!Number.isFinite(Number(it.cantidadSolicitada)) || Number(it.cantidadSolicitada) <= 0) {
          throw new BadRequestException('Cada renglón de madera debe tener cantidad solicitada mayor a 0.');
        }
      }
    }

    let cliente = dto.clienteId ? await this.clienteRepo.findOneBy({ id: dto.clienteId } as any) : null;
    if (!cliente) cliente = await this.clienteRepo.findOneBy({ nombre: dto.clienteNombre.trim(), activo: true } as any);
    if (!cliente) {
      cliente = await this.clienteRepo.save(this.clienteRepo.create({
        nombre: dto.clienteNombre.trim(), cuitDni: dto.clienteCuitDni?.trim() || undefined,
        telefono: dto.clienteTelefono?.trim() || undefined, direccion: dto.clienteDireccion?.trim() || undefined,
        aserradero, activo: true,
      } as Partial<Cliente>)) as unknown as Cliente;
    }
    if (!cliente) throw new BadRequestException('No se pudo resolver el cliente.');

    const numeroPedido = await this.generarNumeroPedido();
    const fecha = dto.fecha?.trim() || new Date().toISOString().slice(0, 10);
    let cantidadSolicitadaTotal = 0;
    let totalP2Solicitado = 0;
    const medidas: string[] = [];

    const pedido = await this.pedidoRepo.save(this.pedidoRepo.create({
      numeroPedido, fecha, clienteId: cliente.id, clienteNombre: cliente.nombre,
      clienteCuitDni: cliente.cuitDni || dto.clienteCuitDni, clienteTelefono: cliente.telefono || dto.clienteTelefono,
      clienteDireccion: cliente.direccion || dto.clienteDireccion, aserradero,
      estado: 'BORRADOR', observaciones: dto.observaciones?.trim() || undefined,
      creadoPor: user.email || user.rol, cantidadSolicitadaTotal: 0, totalP2Solicitado: 0, kgEstimados: null,
    } as Partial<Pedido>)) as unknown as Pedido;

    for (const it of dto.items) {
      const tipo = String((it as any).tipoProducto || 'MADERA').toUpperCase();
      if (tipo === 'SUBPRODUCTO') {
        // D-SP1: Chip/Aserrín. Sin P2/kg inventado; sin asignación a paquetes (F2/F3).
        const sub = String((it as any).subproductoTipo || '').toUpperCase();
        const tn = Number((it as any).tnEstimada);
        cantidadSolicitadaTotal += tn;
        medidas.push(`${sub} ${tn}TN`);
        await this.itemRepo.save(this.itemRepo.create({
          pedidoId: pedido.id, especie: it.especie?.trim() || undefined,
          tipoProducto: 'SUBPRODUCTO', subproductoTipo: sub, tnEstimada: tn,
          espesorSolicitado: null, anchoSolicitado: null, largoSolicitado: null,
          unidadDimensiones: 'TN', cantidadSolicitada: tn,
          cantidadAsignada: 0, cantidadFaltante: tn, p2SolicitadoEstimado: 0,
          estado: 'PENDIENTE', observaciones: it.observaciones?.trim() || undefined,
        } as Partial<PedidoItem>) as PedidoItem);
      } else {
        const p2Est = round3(calcularP2Asignacion({
          paquetes: Number(it.cantidadSolicitada), piezasPorPaquete: 1,
          medidaSolicitada: { espesor: Number(it.espesorSolicitado), ancho: Number(it.anchoSolicitado), largo: Number(it.largoSolicitado) },
          medidaReal: { espesor: Number(it.espesorSolicitado), ancho: Number(it.anchoSolicitado), largo: Number(it.largoSolicitado) },
        }).p2BaseSolicitado); // estimado base sin componentes
        cantidadSolicitadaTotal += Number(it.cantidadSolicitada);
        totalP2Solicitado += p2Est;
        medidas.push(`${Number(it.espesorSolicitado)}x${Number(it.anchoSolicitado)}x${Number(it.largoSolicitado)}`);
        await this.itemRepo.save(this.itemRepo.create({
          pedidoId: pedido.id, especie: it.especie?.trim() || undefined,
          tipoProducto: 'MADERA', subproductoTipo: null, tnEstimada: null,
          espesorSolicitado: Number(it.espesorSolicitado), anchoSolicitado: Number(it.anchoSolicitado), largoSolicitado: Number(it.largoSolicitado),
          unidadDimensiones: it.unidadDimensiones || 'MM', cantidadSolicitada: Number(it.cantidadSolicitada),
          cantidadAsignada: 0, cantidadFaltante: Number(it.cantidadSolicitada), p2SolicitadoEstimado: p2Est,
          estado: 'PENDIENTE', observaciones: it.observaciones?.trim() || undefined,
        } as Partial<PedidoItem>) as PedidoItem);
      }
    }

    pedido.cantidadSolicitadaTotal = round3(cantidadSolicitadaTotal);
    pedido.totalP2Solicitado = round3(totalP2Solicitado);
    pedido.kgEstimados = round3(totalP2Solicitado * 2.2);
    pedido.medidaResumen = medidas.slice(0, 4).join(' | ') + (medidas.length > 4 ? ` (+${medidas.length - 4})` : '');
    await this.pedidoRepo.save(pedido);
    return this.obtener(pedido.id, user);
  }

  async listar(query: any, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const qb = this.pedidoRepo.createQueryBuilder('p').orderBy('p.id', 'DESC');
    const aserraderoFiltro = user.aserradero || String(query?.aserradero || '').trim();
    if (aserraderoFiltro) qb.andWhere('p.aserradero = :a', { a: aserraderoFiltro });
    if (query?.cliente) qb.andWhere('LOWER(p.clienteNombre) LIKE :c', { c: `%${String(query.cliente).toLowerCase()}%` });
    if (query?.estado) qb.andWhere('p.estado = :e', { e: String(query.estado) });
    return qb.getMany();
  }

  async obtener(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const pedido = await this.pedidoRepo.findOneBy({ id } as any);
    if (!pedido) throw new NotFoundException(`Pedido #${id} no encontrado.`);
    if (user.aserradero && pedido.aserradero !== user.aserradero) throw new ForbiddenException('No tienes acceso a pedidos de otro aserradero.');
    const items = await this.itemRepo.find({ where: { pedidoId: id } as any, order: { id: 'ASC' } as any });
    const asignaciones = await this.asignacionRepo.find({ where: { pedidoId: id } as any, order: { id: 'ASC' } as any });
    return { ...pedido, items, asignaciones };
  }

  async buscarStockDisponible(query: any, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const esp = Number(query.espesor), anc = Number(query.ancho), lar = Number(query.largo);
    if (![esp, anc, lar].every(n => Number.isFinite(n) && n > 0)) throw new BadRequestException('Debes indicar espesor, ancho y largo válidos (las 3 dimensiones).');
    const especie = String(query.especie || '');
    const incluirOtros = String(query.incluirOtrosAserraderos || '') === '1' || String(query.incluirOtrosAserraderos || '') === 'true';
    const miAserradero = user.aserradero || '';

    const registros = await this.produccionRepo.find();
    const candidatos: any[] = [];
    for (const r of registros) {
      const disponible = Math.max(0, Number(r.cantidadPaquetes || 0) - Number(r.cantidadReservada || 0));
      if (disponible <= 0) continue;
      if (miAserradero && !incluirOtros && r.aserradero !== miAserradero) continue;
      if (!matchEspecieOpcional(especie, r.especie)) continue;
      const m = matchMedidaTolerante({ espesor: esp, ancho: anc, largo: lar }, { espesor: Number(r.espesor), ancho: Number(r.ancho), largo: Number(r.largo) }, TOLERANCIA_MM);
      if (!m.match) continue;
      const esMio = !miAserradero || r.aserradero === miAserradero;
      candidatos.push({
        id: r.id, produccionId: r.id, lote: r.lote || `L-${r.id}`, aserradero: r.aserradero || 'Sin asignar',
        producto: r.descripcionProducto || r.tipoProducto, especie: r.especie,
        medidaReal: { espesor: Number(r.espesor), ancho: Number(r.ancho), largo: Number(r.largo), unidad: r.unidadDimensiones || 'MM' },
        medidaSolicitada: { espesor: esp, ancho: anc, largo: lar },
        difiereMedida: m.difiere, deltas: { dE: m.dE, dA: m.dA, dL: m.dL }, sumaDelta: m.sumaDelta,
        piezasPorPaquete: Number(r.piezasPorPaquete || 0), disponible, cantidadReservada: Math.max(0, Number(r.cantidadReservada || 0)),
        separadores: r.separadores || [], tacos: r.tacos || [],
        asignableDirecto: esMio, // F1/F3: admin asignado no puede reservar directo stock ajeno sin autorización
        origenOtroAserradero: !esMio,
      });
    }
    return { toleranciaMm: TOLERANCIA_MM, solicitado: { espesor: esp, ancho: anc, largo: lar, especie: especie || null }, items: ordenarCandidatosTolerantes(candidatos) };
  }

  private async recalcularItemPedido(itemId: number, pedidoId: number, manager?: any) {
    const itemRepo = manager ? manager.getRepository(PedidoItem) : this.itemRepo;
    const asigRepo = manager ? manager.getRepository(PedidoAsignacion) : this.asignacionRepo;
    const pedidoRepo = manager ? manager.getRepository(Pedido) : this.pedidoRepo;
    const item = await itemRepo.findOne({ where: { id: itemId } as any });
    if (!item) return;
    // D-SP1/D-SP2: SUBPRODUCTO no se asigna a stock de paquetes; F2/F3 actualizan estado vía manager.
    if (String((item as any).tipoProducto || 'MADERA').toUpperCase() === 'SUBPRODUCTO') {
      const est = String((item as any).estado || 'PENDIENTE').toUpperCase();
      if (est === 'REMITIDO_PROVISORIO' || est === 'CONFIRMADO') {
        item.cantidadAsignada = round3(Number((item as any).tnEstimada ?? item.cantidadSolicitada ?? 0));
        item.cantidadFaltante = 0;
        // preservar estado (set por F2/F3)
      } else {
        item.estado = 'PENDIENTE';
        item.cantidadAsignada = 0;
        item.cantidadFaltante = round3(Number((item as any).tnEstimada ?? item.cantidadSolicitada ?? 0));
      }
      await itemRepo.save(item);
    } else {
      const asignaciones = await asigRepo.find({ where: { pedidoItemId: itemId, pedidoId } as any });
      const progreso = asignaciones.filter((a: any) => ESTADOS_ASIGNACION_ACTIVA.includes(a.estado) || a.estado === 'RESERVADA' || a.estado === 'DESPACHADA');
      const asignada = progreso.reduce((s: number, a: any) => s + Number(a.paquetesAsignados || 0), 0);
      item.cantidadAsignada = round3(asignada);
      item.cantidadFaltante = round3(Math.max(0, Number(item.cantidadSolicitada || 0) - asignada));
      item.estado = item.cantidadFaltante <= 0.0005 ? 'CUBIERTO' : (asignada > 0 ? 'PARCIAL' : 'PENDIENTE');
      await itemRepo.save(item);
    }
    // recalcular pedido
    const pedido = await pedidoRepo.findOne({ where: { id: pedidoId } as any });
    if (pedido && !['ANULADO'].includes(String(pedido.estado))) {
      const items = await itemRepo.find({ where: { pedidoId } as any });
      const allCubierto = items.length > 0 && items.every((i: any) => Number(i.cantidadFaltante || 0) <= 0.0005);
      const anyAsignado = items.some((i: any) => Number(i.cantidadAsignada || 0) > 0);
      const asigPedido = await asigRepo.find({ where: { pedidoId } as any });
      const progresoPedido = asigPedido.filter((a: any) => ESTADOS_ASIGNACION_ACTIVA.includes(a.estado) || a.estado === 'RESERVADA' || a.estado === 'DESPACHADA');
      const hayDesp = asigPedido.some((a: any) => a.estado === 'DESPACHADA');
      const hayRes = asigPedido.some((a: any) => a.estado === 'RESERVADA');
      if (hayDesp && !hayRes && allCubierto) pedido.estado = 'DESPACHADO';
      else if (hayDesp) pedido.estado = 'PARCIAL_DESPACHADO';
      else if (allCubierto) pedido.estado = 'RESERVADO';
      else if (anyAsignado) pedido.estado = 'PARCIAL';
      else pedido.estado = 'BORRADOR';
      pedido.totalP2Solicitado = round3(progresoPedido.reduce((s: number, a: any) => s + Number(a.p2Solicitado || 0), 0));
      pedido.kgEstimados = round3(Number(pedido.totalP2Solicitado || 0) * 2.2);
      await pedidoRepo.save(pedido);
    }
  }

  async crearAsignacion(pedidoId: number, dto: CrearAsignacionDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const pedido = await this.pedidoRepo.findOneBy({ id: pedidoId } as any);
    if (!pedido) throw new NotFoundException('Pedido no encontrado.');
    if (user.aserradero && pedido.aserradero !== user.aserradero) throw new ForbiddenException('No tienes acceso a este pedido.');
    if (['REMITIDO', 'CANCELADO', 'ANULADO'].includes(pedido.estado)) throw new BadRequestException(`No puedes asignar stock a un pedido ${pedido.estado}.`);
    const item = await this.itemRepo.findOneBy({ id: dto.pedidoItemId, pedidoId } as any);
    if (!item) throw new NotFoundException('Renglón del pedido no encontrado.');
    if (String((item as any).tipoProducto || 'MADERA').toUpperCase() === 'SUBPRODUCTO') {
      throw new BadRequestException('Los ítems de subproducto (Chip/Aserrín) no se asignan a stock de paquetes; use Generar Remito de subproducto.');
    }

    return this.dataSource.transaction(async (manager) => {
      const prodRepo = manager.getRepository(ProduccionEntity);
      const asigRepo = manager.getRepository(PedidoAsignacion);
      const reg = await prodRepo.findOne({ where: { id: dto.produccionId } as any, lock: { mode: 'pessimistic_write' } as any });
      if (!reg) throw new NotFoundException('Lote de stock no encontrado.');
      if (user.aserradero && reg.aserradero !== user.aserradero) {
        throw new ForbiddenException('F1: no puedes reservar stock de otro aserradero sin autorización (se habilita en F3).');
      }
      const disponible = Math.max(0, Number(reg.cantidadPaquetes || 0) - Number(reg.cantidadReservada || 0));
      const paquetes = Number(dto.paquetes);
      if (paquetes > disponible + 1e-9) throw new BadRequestException(`Stock disponible insuficiente. Disponible: ${round3(disponible)} paq.`);

      const sol = { espesor: Number(item.espesorSolicitado), ancho: Number(item.anchoSolicitado), largo: Number(item.largoSolicitado) };
      const real = { espesor: Number(reg.espesor || 0), ancho: Number(reg.ancho || 0), largo: Number(reg.largo || 0) };
      const m = matchMedidaTolerante(sol, real, TOLERANCIA_MM);
      if (!m.match) throw new BadRequestException(`La medida del lote difiere más de ±${TOLERANCIA_MM}mm (tolerancia D1).`);
      if (item.especie && !matchEspecieOpcional(item.especie, reg.especie)) throw new BadRequestException('La especie del lote no coincide con la solicitada.');

      const p2 = calcularP2Asignacion({ paquetes, piezasPorPaquete: Number(reg.piezasPorPaquete || 0), medidaSolicitada: sol, medidaReal: real, separadores: reg.separadores || [], tacos: reg.tacos || [] });
      reg.cantidadReservada = round3(Math.max(0, Number(reg.cantidadReservada || 0)) + paquetes);
      await prodRepo.save(reg);

      const asig = asigRepo.create({
        pedidoId, pedidoItemId: item.id, produccionId: reg.id,
        aserraderoOrigen: reg.aserradero, aserraderoGestion: pedido.aserradero,
        paquetesAsignados: paquetes, piezasPorPaquete: Number(reg.piezasPorPaquete || 0), tablasAsignadas: p2.tablas,
        medidaSolicitadaEsp: sol.espesor, medidaSolicitadaAnc: sol.ancho, medidaSolicitadaLar: sol.largo,
        medidaRealEsp: real.espesor, medidaRealAnc: real.ancho, medidaRealLar: real.largo,
        unidadDimensionesReal: reg.unidadDimensiones || 'MM', difiereMedida: m.difiere, toleranciaMm: TOLERANCIA_MM,
        p2Solicitado: p2.p2Solicitado, p2Real: p2.p2Real,
        separadoresSnapshot: reg.separadores || [], tacosSnapshot: reg.tacos || [],
        estado: 'RESERVADA', solicitadoPor: user.email || user.rol,
      } as Partial<PedidoAsignacion>) as PedidoAsignacion;
      const saved = await asigRepo.save(asig) as unknown as PedidoAsignacion;
      return saved;
    }).then(async () => {
      await this.recalcularItemPedido(dto.pedidoItemId, pedidoId);
      return this.obtener(pedidoId, user);
    });
  }

  async liberarAsignacion(pedidoId: number, asignacionId: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const pedido = await this.pedidoRepo.findOneBy({ id: pedidoId } as any);
    if (!pedido) throw new NotFoundException('Pedido no encontrado.');
    if (user.aserradero && pedido.aserradero !== user.aserradero) throw new ForbiddenException('No tienes acceso a este pedido.');
    if (['REMITIDO', 'DESPACHADO'].includes(pedido.estado)) throw new BadRequestException('No puedes modificar asignaciones de un pedido ya despachado/remitido.');

    return this.dataSource.transaction(async (manager) => {
      const prodRepo = manager.getRepository(ProduccionEntity);
      const asigRepo = manager.getRepository(PedidoAsignacion);
      const asig = await asigRepo.findOne({ where: { id: asignacionId, pedidoId } as any });
      if (!asig) throw new NotFoundException('Asignación no encontrada.');
      if (!['RESERVADA'].includes(asig.estado)) throw new BadRequestException(`No se puede liberar una asignación en estado ${asig.estado}.`);
      const reg = await prodRepo.findOne({ where: { id: asig.produccionId } as any, lock: { mode: 'pessimistic_write' } as any });
      if (reg) {
        reg.cantidadReservada = round3(Math.max(0, Number(reg.cantidadReservada || 0) - Number(asig.paquetesAsignados || 0)));
        await prodRepo.save(reg);
      }
      asig.estado = 'LIBERADA';
      await asigRepo.save(asig);
      return asig.pedidoItemId;
    }).then(async (itemId) => {
      await this.recalcularItemPedido(itemId, pedidoId);
      return this.obtener(pedidoId, user);
    });
  }

  private async generarNumeroRemitoMax(manager: any): Promise<string> {
    const row = await manager.query(
      `SELECT COALESCE(MAX((regexp_match("numeroRemito", '^REM-([0-9]+)$'))[1]::int), 0) AS maxn FROM salidas_stock WHERE "numeroRemito" ~ '^REM-[0-9]+$'`,
    );
    const maxn = Number(row?.[0]?.maxn || 0);
    return `REM-${String(maxn + 1).padStart(5, '0')}`;
  }

  /**
   * V2 MVP: Despacho/venta desde pedido. Transición atómica RESERVADA->DESPACHADA:
   * decrementa cantidadReservada Y cantidadPaquetes (físico), crea SalidaStock+detalles,
   * vincula pedido. Remitos parciales permitidos (solo asignaciones indicadas o todas RESERVADA).
   * Supuesto MVP: anulación post-emisión PEDIDO bloqueada (v1).
   */
  async emitirDespacho(pedidoId: number, dto: EmitirDespachoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const attempt = async (): Promise<any> => this.dataSource.transaction(async (manager) => {
      const pedidoRepo = manager.getRepository(Pedido);
      const itemRepo = manager.getRepository(PedidoItem);
      const asigRepo = manager.getRepository(PedidoAsignacion);
      const prodRepo = manager.getRepository(ProduccionEntity);
      const cliRepo = manager.getRepository(Cliente);
      const salRepo = manager.getRepository(SalidaStock);
      const detRepo = manager.getRepository(SalidaStockDetalle);

      const pedido = await pedidoRepo.findOne({ where: { id: pedidoId } as any });
      if (!pedido) throw new NotFoundException('Pedido no encontrado.');
      if (user.aserradero && pedido.aserradero !== user.aserradero) throw new ForbiddenException('No tienes acceso a este pedido.');
      if (['ANULADO', 'DESPACHADO'].includes(String(pedido.estado))) throw new BadRequestException(`Pedido en estado ${pedido.estado} no puede despacharse.`);

      let asignaciones: PedidoAsignacion[] = [];
      if (dto.lineas && dto.lineas.length > 0) {
        for (const l of dto.lineas) {
          const a = await asigRepo.findOne({ where: { id: l.pedidoAsignacionId, pedidoId } as any });
          if (!a) throw new NotFoundException(`Asignación #${l.pedidoAsignacionId} no encontrada en el pedido.`);
          asignaciones.push(a);
        }
      } else {
        asignaciones = await asigRepo.find({ where: { pedidoId, estado: 'RESERVADA' } as any });
      }
      if (asignaciones.length === 0) throw new BadRequestException('No hay asignaciones RESERVADA para despachar.');

      const lineMap = new Map((dto.lineas || []).map(l => [l.pedidoAsignacionId, l]));
      for (const a of asignaciones) {
        if (String(a.estado) !== 'RESERVADA') throw new BadRequestException(`La asignación #${a.id} no está RESERVADA (estado: ${a.estado}).`);
        const userA = typeof user?.aserradero === 'string' ? user.aserradero.trim() : '';
        const gest = (a as any).aserraderoGestion || (a as any).aserraderoOrigen;
        if (userA && gest && gest !== userA) throw new ForbiddenException(`Asignación #${a.id} fuera de su aserradero.`);
      }

      // lock produccion rows ordered by id (deadlock-safe)
      const prodIds = Array.from(new Set(asignaciones.map(a => a.produccionId))).sort((a, b) => a - b);
      const prodLocked = new Map<number, ProduccionEntity>();
      for (const pid of prodIds) {
        const reg = await prodRepo.findOne({ where: { id: pid } as any, lock: { mode: 'pessimistic_write' } as any });
        if (!reg) throw new NotFoundException(`Stock/producción #${pid} no encontrado.`);
        prodLocked.set(pid, reg);
      }

      let cliente: any = null;
      if (pedido.clienteId) cliente = await cliRepo.findOne({ where: { id: pedido.clienteId } as any });
      const alicCliente = resolverAlicuotaIva(dto.alicuotaIvaDefault, cliente?.alicuotaIvaDefault, IVA_DEFAULT);

      const detallePreps: any[] = [];
      const legacyItems: any[] = [];
      let totalPaq = 0, totalPiezas = 0, totalP2 = 0;
      const touchedItemIds = new Set<number>();

      for (const a of asignaciones) {
        const reg = prodLocked.get(a.produccionId)!;
        const paq = toFinite(a.paquetesAsignados);
        const reservada = toFinite(reg.cantidadReservada);
        const fisico = toFinite(reg.cantidadPaquetes);
        if (paq <= 0) throw new BadRequestException(`Asignación #${a.id} sin paquetes.`);
        if (reservada + 1e-9 < paq) throw new BadRequestException(`Reserva inconsistente en stock #${reg.id} (reservada ${round3(reservada)} < ${round3(paq)}).`);
        if (fisico + 1e-9 < paq) throw new BadRequestException(`Stock físico insuficiente en #${reg.id} (físico ${round3(fisico)} < ${round3(paq)}).`);

        // V2 core: Reservado -> Despachado (libera reserva Y descuenta físico)
        reg.cantidadReservada = Math.max(0, round3(reservada - paq));
        reg.cantidadPaquetes = Math.max(0, round3(fisico - paq));
        await prodRepo.save(reg);

        a.estado = 'DESPACHADA';
        (a as any).retiradoPor = user.email || (user as any).rol || null;
        (a as any).fechaRetiro = new Date().toISOString().slice(0, 10);
        await asigRepo.save(a);
        touchedItemIds.add(a.pedidoItemId);

        const item = await itemRepo.findOne({ where: { id: a.pedidoItemId } as any });
        const piezas = toFinite(a.tablasAsignadas) || (paq * toFinite(a.piezasPorPaquete));
        const p2 = toFinite(a.p2Solicitado); // comercial
        const l = lineMap.get(a.id);
        const fin = calcularLineaFinanciera({ unidadPrecio: l?.unidadPrecio || 'P2', precioUnitario: l?.precioUnitario ?? 0, alicuotaIva: resolverAlicuotaIva(l?.alicuotaIva, alicCliente, IVA_DEFAULT), p2, cantidad: paq, m2: l?.m2 });
        totalPaq += paq; totalPiezas += piezas; totalP2 += p2;
        const medidaTxt = `${toFinite(a.medidaSolicitadaEsp)}x${toFinite(a.medidaSolicitadaAnc)}x${toFinite(a.medidaSolicitadaLar)}`;
        detallePreps.push({ tipoRenglon: 'MADERA_PAQUETE', produccionId: a.produccionId, pedidoAsignacionId: a.id, productoTipo: (reg as any).tipoProducto || null, productoEspecie: (reg as any).especie || item?.especie || null, detalle: (reg as any).descripcionProducto || null, medidaTexto: medidaTxt, espesorSolicitado: a.medidaSolicitadaEsp, anchoSolicitado: a.medidaSolicitadaAnc, largoSolicitado: a.medidaSolicitadaLar, espesorReal: a.medidaRealEsp, anchoReal: a.medidaRealAnc, largoReal: a.medidaRealLar, difiereMedida: !!a.difiereMedida, cantidad: paq, piezas, p2, m2: l?.m2 ?? null, unidadPrecio: l?.unidadPrecio || 'P2', ...fin });
        legacyItems.push({ produccionId: a.produccionId, pedidoAsignacionId: a.id, lote: (reg as any).lote || `L-${reg.id}`, paquetesDespachados: paq, piezasDespachadas: piezas, p2, medidaSolicitada: medidaTxt, difiereMedida: !!a.difiereMedida, ...fin });
      }

      const totF = sumarTotales(detallePreps);
      const fecha = dto.fecha?.trim() || new Date().toISOString().slice(0, 10);
      const estadoFacturacion = estadoFacturacionDesde(dto.facturaNumero, dto.tipoComprobante);
      const numeroRemito = await this.generarNumeroRemitoMax(manager);

      const salida = await salRepo.save(salRepo.create({
        numeroRemito, fecha, aserradero: pedido.aserradero,
        clienteId: pedido.clienteId || cliente?.id || null, clienteNombre: pedido.clienteNombre,
        clienteCuitDni: pedido.clienteCuitDni || cliente?.cuitDni || null,
        clienteTelefono: pedido.clienteTelefono || cliente?.telefono || null,
        clienteDireccion: pedido.clienteDireccion || cliente?.direccion || null,
        cantidadSolicitada: round3(totalPaq), medidaSolicitada: null,
        totalPaquetesDespachados: round3(totalPaq), totalPiezasDespachadas: round3(totalPiezas), totalP2Despachado: round3(totalP2),
        observaciones: dto.observaciones?.trim() || pedido.observaciones || null,
        items: legacyItems, estado: 'CONFIRMADA', creadoPor: user.email || null,
        pedidoId: pedido.id, remitoFisicoNumero: dto.remitoFisicoNumero?.trim() || null,
        tipoComprobante: dto.tipoComprobante?.trim() || null, facturaNumero: dto.facturaNumero?.trim() || null,
        estadoFacturacion, transporte: dto.transporte?.trim() || null,
        origenTipo: 'PEDIDO', estadoDespacho: 'CONFIRMADO', moneda: 'ARS',
        subtotalNeto: totF.subtotalNeto, ivaMonto: totF.ivaMonto, total: totF.total,
        basculaPendiente: false, facturadoAt: estadoFacturacion === 'FACTURADO' ? new Date() : null,
        usuario: user.email || null,
      } as any) as unknown as SalidaStock);

      const detalles: SalidaStockDetalle[] = [];
      for (let i = 0; i < detallePreps.length; i++) {
        const d = await detRepo.save(detRepo.create({ ...(detallePreps[i] as any), salidaStockId: salida.id } as any) as unknown as SalidaStockDetalle);
        detalles.push(d);
        asignaciones[i].salidaStockId = salida.id;
        asignaciones[i].salidaDetalleId = d.id;
        await asigRepo.save(asignaciones[i]);
      }

      pedido.salidaStockId = pedido.salidaStockId || salida.id;
      pedido.remitoFisicoNumero = dto.remitoFisicoNumero?.trim() || pedido.remitoFisicoNumero || salida.numeroRemito;
      await pedidoRepo.save(pedido);
      for (const itemId of touchedItemIds) await this.recalcularItemPedido(itemId, pedido.id, manager);

      return { salida: { ...salida, detalles }, pedidoId: pedido.id, numeroRemito: salida.numeroRemito, despachadas: asignaciones.length, totales: totF };
    });

    try { return await attempt(); }
    catch (e: any) {
      if (isUniqueViolation(e)) return await attempt();
      throw e;
    }
  }

  /**
   * F2 D-SP2/D-SP3: emite remito provisional (PENDIENTE_BASCULA) para ítems SUBPRODUCTO del pedido.
   * Crea SalidaStock PEDIDO vinculada, sin tocar stock/produccion. Correlativo robusto con retry 23505.
   */
  async emitirRemitoSubproducto(pedidoId: number, dto: EmitirRemitoSubproductoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const attempt = async (): Promise<any> => this.dataSource.transaction(async (manager) => {
      const pedidoRepo = manager.getRepository(Pedido);
      const itemRepo = manager.getRepository(PedidoItem);
      const salRepo = manager.getRepository(SalidaStock);
      const detRepo = manager.getRepository(SalidaStockDetalle);
      const cliRepo = manager.getRepository(Cliente);

      const pedido = await pedidoRepo.findOne({ where: { id: pedidoId } as any });
      if (!pedido) throw new NotFoundException('Pedido no encontrado.');
      if (user.aserradero && pedido.aserradero !== user.aserradero) throw new ForbiddenException('No tienes acceso a este pedido.');
      if (['ANULADO', 'CANCELADO'].includes(String(pedido.estado || '').toUpperCase())) {
        throw new BadRequestException(`No puedes emitir remito de subproducto para un pedido ${pedido.estado}.`);
      }

      const items = await itemRepo.find({ where: { pedidoId } as any });
      const overrideMap = new Map<number, { subproductoTipo?: string; tnEstimada?: number }>();
      if (Array.isArray((dto as any).items) && (dto as any).items.length) {
        for (const ov of (dto as any).items) {
          const oid = Number((ov as any)?.id);
          if (Number.isFinite(oid)) overrideMap.set(oid, { subproductoTipo: (ov as any).subproductoTipo, tnEstimada: (ov as any).tnEstimada });
        }
      }
      const idsFromItems = overrideMap.size ? Array.from(overrideMap.keys()) : null;
      const idSet = idsFromItems
        ? new Set(idsFromItems)
        : (Array.isArray(dto.itemIds) && dto.itemIds.length ? new Set(dto.itemIds.map((n) => Number(n))) : null);
      const candidatos = items.filter((it: any) => {
        if (String(it.tipoProducto || 'MADERA').toUpperCase() !== 'SUBPRODUCTO') return false;
        if (idSet) return idSet.has(Number(it.id));
        return true;
      });

      if (idSet) {
        const requestedIds = idsFromItems || dto.itemIds || [];
        const missing = requestedIds.filter((id) => !items.some((it: any) => Number(it.id) === Number(id) && String(it.tipoProducto || '').toUpperCase() === 'SUBPRODUCTO'));
        if (missing.length) throw new BadRequestException(`Ítems no encontrados o no son SUBPRODUCTO en el pedido: ${missing.join(', ')}.`);
        const wrongState = candidatos.filter((it: any) => String(it.estado || '').toUpperCase() !== 'PENDIENTE');
        if (wrongState.length) {
          throw new BadRequestException(`No se puede emitir remito: ítem(s) SUBPRODUCTO ya emitido(s)/no pendiente(s) (#${wrongState.map((it: any) => it.id).join(', #')}, estado: ${wrongState.map((it: any) => it.estado).join(', ')}).`);
        }
      }

      const pendientes = candidatos.filter((it: any) => String(it.estado || 'PENDIENTE').toUpperCase() === 'PENDIENTE');
      if (pendientes.length === 0) {
        throw new BadRequestException('No hay ítems de subproducto pendientes para emitir remito.');
      }

      const allowedSub = new Set(['ASERRIN', 'CHIP']);
      for (const it of pendientes as any[]) {
        const ov = overrideMap.get(Number(it.id));
        if (ov?.subproductoTipo) it.subproductoTipo = String(ov.subproductoTipo).toUpperCase();
        if (ov?.tnEstimada != null) it.tnEstimada = Number(ov.tnEstimada);
        const sub = String(it.subproductoTipo || '').toUpperCase();
        if (!allowedSub.has(sub)) {
          throw new BadRequestException(`Ítem #${it.id}: subproductoTipo inválido (debe ser ASERRIN o CHIP).`);
        }
        const tn = Number(it.tnEstimada);
        if (!Number.isFinite(tn) || tn <= 0) {
          throw new BadRequestException(`Ítem #${it.id}: tnEstimada debe ser mayor a 0.`);
        }
      }

      let cliente: any = null;
      if (pedido.clienteId) cliente = await cliRepo.findOne({ where: { id: pedido.clienteId } as any });
      const alicBase = resolverAlicuotaIva(dto.alicuotaIvaDefault, cliente?.alicuotaIvaDefault, IVA_DEFAULT);
      const alicuotaIva = resolverAlicuotaIva(dto.alicuotaIva, alicBase, IVA_DEFAULT);
      const precioUnitario = Math.max(0, toFinite(dto.precioPorTn, 0));

      const detallePreps = (pendientes as any[]).map((it) => {
        const tn = round3(Number(it.tnEstimada));
        const sub = String(it.subproductoTipo).toUpperCase();
        const especie = it.especie || 'MEZCLA';
        const fin = calcularLineaFinanciera({
          unidadPrecio: 'TN',
          precioUnitario,
          alicuotaIva,
          tnProvisionales: tn,
          cantidad: 1,
        });
        return {
          item: it,
          tn,
          sub,
          especie,
          fin,
          detalle: {
            tipoRenglon: 'SUBPRODUCTO',
            productoTipo: sub,
            productoEspecie: especie,
            detalle: `${sub} TN estimada ${tn}`,
            medidaTexto: 'TN',
            cantidad: 1,
            p2: 0,
            toneladas: tn,
            tnProvisionales: tn,
            tnReales: null,
            unidadPrecio: 'TN',
            estadoLinea: 'PENDIENTE_BASCULA',
            pedidoAsignacionId: null,
            ...fin,
          },
        };
      });

      const totF = sumarTotales(detallePreps.map((d) => d.detalle as any));
      const tnTotal = round3(detallePreps.reduce((acc, d) => acc + d.tn, 0));
      const fecha = dto.fecha?.trim() || new Date().toISOString().slice(0, 10);
      const estadoFacturacion = estadoFacturacionDesde(dto.facturaNumero, dto.tipoComprobante);
      const numeroRemito = await this.generarNumeroRemitoMax(manager);

      const salida = await salRepo.save(salRepo.create({
        numeroRemito,
        fecha,
        aserradero: pedido.aserradero,
        clienteId: pedido.clienteId || cliente?.id || null,
        clienteNombre: pedido.clienteNombre,
        clienteCuitDni: pedido.clienteCuitDni || cliente?.cuitDni || null,
        clienteTelefono: pedido.clienteTelefono || cliente?.telefono || null,
        clienteDireccion: pedido.clienteDireccion || cliente?.direccion || null,
        cantidadSolicitada: tnTotal,
        medidaSolicitada: 'TN',
        totalPaquetesDespachados: 0,
        totalPiezasDespachadas: 0,
        totalP2Despachado: 0,
        observaciones: dto.observaciones?.trim() || pedido.observaciones || null,
        items: detallePreps.map((d) => ({
          tipo: 'SUBPRODUCTO',
          producto: d.sub,
          especie: d.especie,
          toneladas: d.tn,
          tnProvisionales: d.tn,
          tnReales: null,
          importeNeto: d.fin.importeNeto,
          ivaMonto: d.fin.ivaMonto,
          total: d.fin.total,
          precioUnitario: d.fin.precioUnitario,
          alicuotaIva: d.fin.alicuotaIva,
          unidadPrecio: 'TN',
          pedidoItemId: d.item.id,
        })),
        estado: 'CONFIRMADA',
        creadoPor: user.email || (user as any).rol || null,
        pedidoId: pedido.id,
        remitoFisicoNumero: dto.remitoFisicoNumero?.trim() || null,
        tipoComprobante: dto.tipoComprobante?.trim() || null,
        facturaNumero: dto.facturaNumero?.trim() || null,
        estadoFacturacion,
        transporte: dto.transporte?.trim() || null,
        origenTipo: 'PEDIDO',
        estadoDespacho: 'PENDIENTE_BASCULA',
        moneda: 'ARS',
        subtotalNeto: totF.subtotalNeto,
        ivaMonto: totF.ivaMonto,
        total: totF.total,
        toneladasTotal: totF.tnTotal || tnTotal || null,
        basculaPendiente: true,
        facturadoAt: estadoFacturacion === 'FACTURADO' ? new Date() : null,
        usuario: user.email || null,
      } as any) as unknown as SalidaStock);

      const egRepo = manager.getRepository(SubproductoEgreso);
      const detalles: SalidaStockDetalle[] = [];
      for (const d of detallePreps) {
        const det = await detRepo.save(detRepo.create({ ...(d.detalle as any), salidaStockId: salida.id } as any) as unknown as SalidaStockDetalle);
        const eg = egRepo.create({
          aserradero: salida.aserradero || pedido.aserradero || 'Prueba',
          tipo: d.sub,
          fecha: fecha.slice(0, 10),
          especieDeclarada: String(d.especie || 'MEZCLA').toUpperCase() as any,
          tnEstimadas: d.tn,
          tnReales: null,
          precioPorTn: precioUnitario || null,
          estado: 'ESTIMADO',
          referencia: `${numeroRemito}${dto.remitoFisicoNumero ? '/' + String(dto.remitoFisicoNumero).trim() : ''}`,
          observaciones: `Remito subproducto emitido (PENDIENTE_BASCULA) pedido #${pedido.id}, salida #${salida.id}, det #${det.id}.`,
          usuario: user.email || null,
        } as any) as unknown as SubproductoEgreso;
        const egSaved = await egRepo.save(eg as any);
        det.subproductoEgresoId = (egSaved as any).id;
        await detRepo.save(det);
        detalles.push(det);
      }

      for (const d of detallePreps) {
        const it = d.item as any;
        it.estado = 'REMITIDO_PROVISORIO';
        it.cantidadAsignada = round3(d.tn);
        it.cantidadFaltante = 0;
        await itemRepo.save(it);
      }

      if (!pedido.salidaStockId) pedido.salidaStockId = salida.id;
      pedido.remitoFisicoNumero = dto.remitoFisicoNumero?.trim() || pedido.remitoFisicoNumero || salida.numeroRemito;
      await pedidoRepo.save(pedido);

      for (const d of detallePreps) {
        await this.recalcularItemPedido(d.item.id, pedido.id, manager);
      }

      return {
        salida: { ...salida, detalles },
        pedidoId: pedido.id,
        numeroRemito: salida.numeroRemito,
        itemsEmitidos: detallePreps.map((d) => d.item.id),
      };
    });

    try { return await attempt(); }
    catch (e: any) {
      if (isUniqueViolation(e)) return await attempt();
      throw e;
    }
  }
}
