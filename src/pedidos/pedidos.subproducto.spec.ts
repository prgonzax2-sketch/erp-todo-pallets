import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PedidosService } from './pedidos.service.js';
import { Pedido } from './entities/pedido.entity.js';
import { PedidoItem } from './entities/pedido-item.entity.js';
import { PedidoAsignacion } from './entities/pedido-asignacion.entity.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { SalidaStock } from '../salidas-stock/entities/salida-stock.entity.js';
import { SalidaStockDetalle } from '../salidas-stock/entities/salida-stock-detalle.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

describe('PedidosService D-SP1/D-SP2 subproducto (F1)', () => {
  const adminUser: AuthenticatedUser = { sub: 1, email: 'admin@test.com', rol: 'admin', aserradero: 'Norte' } as any;

  const makeRepo = (over: any = {}) => ({
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn((d: any) => ({ ...d })),
    save: vi.fn(async (d: any) => ({ id: d.id || 1, ...d })),
    findOneBy: vi.fn().mockResolvedValue(null),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    createQueryBuilder: vi.fn(),
    ...over,
  });

  let pedidoRepo: any;
  let itemRepo: any;
  let asignacionRepo: any;
  let produccionRepo: any;
  let clienteRepo: any;
  let dataSource: any;
  let service: PedidosService;

  beforeEach(() => {
    vi.clearAllMocks();
    const savedItems: any[] = [];
    pedidoRepo = makeRepo({
      save: vi.fn(async (d: any) => ({ id: 10, ...d })),
      findOneBy: vi.fn(async (q: any) => (q?.id === 10 ? { id: 10, aserradero: 'Norte', estado: 'BORRADOR' } : null)),
    });
    itemRepo = makeRepo({
      save: vi.fn(async (d: any) => {
        const row = { id: d.id || savedItems.length + 1, ...d };
        savedItems.push(row);
        return row;
      }),
      find: vi.fn(async () => savedItems),
      findOne: vi.fn(async ({ where }: any) => savedItems.find((i) => i.id === where.id) || null),
      findOneBy: vi.fn(async (q: any) => savedItems.find((i) => i.id === q.id && i.pedidoId === q.pedidoId) || null),
    });
    asignacionRepo = makeRepo({ find: vi.fn().mockResolvedValue([]) });
    produccionRepo = makeRepo();
    clienteRepo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue({ id: 5, nombre: 'Cliente X', activo: true, aserradero: 'Norte' }),
      save: vi.fn(async (d: any) => ({ id: 5, ...d })),
      create: vi.fn((d: any) => ({ ...d })),
    });
    dataSource = { transaction: vi.fn(async (fn: any) => fn({ getRepository: () => makeRepo() })) } as unknown as DataSource;
    service = new PedidosService(
      pedidoRepo as Repository<Pedido>,
      itemRepo as Repository<PedidoItem>,
      asignacionRepo as Repository<PedidoAsignacion>,
      produccionRepo as Repository<ProduccionEntity>,
      clienteRepo as Repository<Cliente>,
      dataSource,
    );
  });

  it('crea ítem SUBPRODUCTO CHIP sin dims ni P2/kg inventado', async () => {
    await service.crear(
      {
        clienteNombre: 'Cliente X',
        items: [{ tipoProducto: 'SUBPRODUCTO', subproductoTipo: 'CHIP', tnEstimada: 12 }],
      } as any,
      adminUser,
    );
    const itemCreate = itemRepo.create.mock.calls.map((c: any[]) => c[0]).find((d: any) => d.tipoProducto === 'SUBPRODUCTO');
    expect(itemCreate).toMatchObject({
      tipoProducto: 'SUBPRODUCTO',
      subproductoTipo: 'CHIP',
      tnEstimada: 12,
      espesorSolicitado: null,
      anchoSolicitado: null,
      largoSolicitado: null,
      cantidadSolicitada: 12,
      cantidadAsignada: 0,
      cantidadFaltante: 12,
      p2SolicitadoEstimado: 0,
      estado: 'PENDIENTE',
    });
    const pedidoSave = pedidoRepo.save.mock.calls.map((c: any[]) => c[0]).find((d: any) => d.medidaResumen);
    expect(pedidoSave.medidaResumen).toContain('CHIP 12TN');
    expect(pedidoSave.totalP2Solicitado).toBe(0);
    expect(pedidoSave.kgEstimados).toBe(0);
  });

  it('crea mix MADERA + SUBPRODUCTO: madera conserva P2, subproducto aporta 0 P2', async () => {
    await service.crear(
      {
        clienteNombre: 'Cliente X',
        items: [
          { espesorSolicitado: 25, anchoSolicitado: 100, largoSolicitado: 3000, cantidadSolicitada: 2 },
          { tipoProducto: 'SUBPRODUCTO', subproductoTipo: 'ASERRIN', tnEstimada: 5 },
        ],
      } as any,
      adminUser,
    );
    const pedidoSave = pedidoRepo.save.mock.calls.map((c: any[]) => c[0]).find((d: any) => d.medidaResumen);
    expect(pedidoSave.totalP2Solicitado).toBeGreaterThan(0);
    expect(pedidoSave.medidaResumen).toContain('ASERRIN 5TN');
  });

  it('rechaza SUBPRODUCTO sin tnEstimada válida', async () => {
    await expect(
      service.crear(
        { clienteNombre: 'Cliente X', items: [{ tipoProducto: 'SUBPRODUCTO', subproductoTipo: 'CHIP' }] } as any,
        adminUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza crearAsignacion sobre ítem SUBPRODUCTO', async () => {
    itemRepo.findOneBy.mockResolvedValue({ id: 7, pedidoId: 10, tipoProducto: 'SUBPRODUCTO', subproductoTipo: 'CHIP' });
    pedidoRepo.findOneBy.mockResolvedValue({ id: 10, aserradero: 'Norte', estado: 'BORRADOR' });
    await expect(service.crearAsignacion(10, { pedidoItemId: 7, produccionId: 1, paquetes: 1 } as any, adminUser)).rejects.toThrow(
      'subproducto',
    );
  });

  it('recalcularItemPedido preserva REMITIDO_PROVISORIO/CONFIRMADO en SUBPRODUCTO (D-SP2 prep)', async () => {
    const subItem = {
      id: 3,
      pedidoId: 10,
      tipoProducto: 'SUBPRODUCTO',
      subproductoTipo: 'CHIP',
      tnEstimada: 12,
      cantidadSolicitada: 12,
      cantidadAsignada: 0,
      cantidadFaltante: 12,
      estado: 'REMITIDO_PROVISORIO',
    };
    itemRepo.findOne.mockResolvedValue(subItem);
    itemRepo.find.mockResolvedValue([subItem]);
    pedidoRepo.findOne.mockResolvedValue({ id: 10, aserradero: 'Norte', estado: 'BORRADOR' });
    await (service as any).recalcularItemPedido(3, 10);
    expect(subItem.estado).toBe('REMITIDO_PROVISORIO');
    expect(subItem.cantidadFaltante).toBe(0);
    expect(subItem.cantidadAsignada).toBe(12);
  });
});

describe('PedidosService emitirRemitoSubproducto D-SP2/D-SP3 (F2)', () => {
  const adminUser: AuthenticatedUser = { sub: 1, email: 'admin@test.com', rol: 'admin', aserradero: 'Norte' } as any;

  const makeRepo = (over: any = {}) => ({
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn((d: any) => ({ ...d })),
    save: vi.fn(async (d: any) => ({ id: d.id || 1, ...d })),
    findOneBy: vi.fn().mockResolvedValue(null),
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    createQueryBuilder: vi.fn(),
    ...over,
  });

  let pedidoRepo: any;
  let itemRepo: any;
  let asignacionRepo: any;
  let produccionRepo: any;
  let clienteRepo: any;
  let salRepo: any;
  let detRepo: any;
  let manager: any;
  let dataSource: any;
  let service: PedidosService;

  const basePedido = { id: 10, aserradero: 'Norte', estado: 'BORRADOR', clienteId: 5, clienteNombre: 'Cliente X', clienteCuitDni: '20', clienteTelefono: '1', clienteDireccion: 'Calle' };
  const subItem = () => ({
    id: 3,
    pedidoId: 10,
    tipoProducto: 'SUBPRODUCTO',
    subproductoTipo: 'CHIP',
    especie: 'Eucalipto',
    tnEstimada: 12,
    cantidadSolicitada: 12,
    cantidadAsignada: 0,
    cantidadFaltante: 12,
    estado: 'PENDIENTE',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const item = subItem();
    pedidoRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    itemRepo = makeRepo({
      find: vi.fn(async () => [item]),
      findOne: vi.fn(async ({ where }: any) => (where?.id === item.id ? item : null)),
      findOneBy: vi.fn(async (q: any) => (q?.id === item.id ? item : null)),
      save: vi.fn(async (d: any) => Object.assign(item, d)),
    });
    asignacionRepo = makeRepo({ find: vi.fn().mockResolvedValue([]) });
    produccionRepo = makeRepo();
    clienteRepo = makeRepo({ findOne: vi.fn().mockResolvedValue({ id: 5, nombre: 'Cliente X', alicuotaIvaDefault: 21 }) });
    salRepo = makeRepo({
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn(async (d: any) => ({ id: 77, ...d })),
    });
    detRepo = makeRepo({
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn(async (d: any) => ({ id: 88, ...d })),
    });
    const txPedidoRepo = makeRepo({
      findOne: vi.fn().mockResolvedValue({ ...basePedido }),
      save: vi.fn(async (d: any) => ({ ...basePedido, ...d })),
    });
    manager = {
      query: vi.fn().mockResolvedValue([{ maxn: 4 }]),
      getRepository: (entity: any) => {
        if (entity === SalidaStock) return salRepo;
        if (entity === SalidaStockDetalle) return detRepo;
        if (entity === Pedido) return txPedidoRepo;
        if (entity === PedidoItem) return itemRepo;
        if (entity === Cliente) return clienteRepo;
        return makeRepo();
      },
    };
    dataSource = { transaction: vi.fn(async (fn: any) => fn(manager)) } as unknown as DataSource;
    service = new PedidosService(
      pedidoRepo as Repository<Pedido>,
      itemRepo as Repository<PedidoItem>,
      asignacionRepo as Repository<PedidoAsignacion>,
      produccionRepo as Repository<ProduccionEntity>,
      clienteRepo as Repository<Cliente>,
      dataSource,
    );
  });

  it('emite remito provisorio SUBPRODUCTO: PENDIENTE_BASCULA, basculaPendiente, origenTipo=PEDIDO, pedidoId, TN estimada, sin produccion', async () => {
    const res = await service.emitirRemitoSubproducto(10, { precioPorTn: 100 } as any, adminUser);

    expect(res.numeroRemito).toBe('REM-00005');
    expect(res.pedidoId).toBe(10);
    expect(res.itemsEmitidos).toEqual([3]);
    expect(res.salida.estadoDespacho).toBe('PENDIENTE_BASCULA');
    expect(res.salida.basculaPendiente).toBe(true);
    expect(res.salida.origenTipo).toBe('PEDIDO');
    expect(res.salida.pedidoId).toBe(10);
    expect(res.salida.estado).toBe('CONFIRMADA');
    expect(res.salida.totalPaquetesDespachados).toBe(0);
    expect(res.salida.totalP2Despachado).toBe(0);
    expect(res.salida.toneladasTotal).toBe(12);
    expect(res.salida.detalles).toHaveLength(1);
    expect(res.salida.detalles[0]).toMatchObject({
      tipoRenglon: 'SUBPRODUCTO',
      productoTipo: 'CHIP',
      tnProvisionales: 12,
      toneladas: 12,
      unidadPrecio: 'TN',
      estadoLinea: 'PENDIENTE_BASCULA',
      p2: 0,
    });

    const itemSaves = itemRepo.save.mock.calls.map((c: any[]) => c[0]);
    expect(itemSaves.some((s: any) => s.estado === 'REMITIDO_PROVISORIO' && s.cantidadAsignada === 12 && s.cantidadFaltante === 0)).toBe(true);

    expect(produccionRepo.findOne).not.toHaveBeenCalled();
    expect(produccionRepo.save).not.toHaveBeenCalled();
    expect(produccionRepo.find).not.toHaveBeenCalled();
  });

  it('rechaza si no hay ítems de subproducto pendientes', async () => {
    itemRepo.find.mockResolvedValue([{ id: 3, pedidoId: 10, tipoProducto: 'MADERA', estado: 'PENDIENTE' }]);
    await expect(service.emitirRemitoSubproducto(10, {} as any, adminUser)).rejects.toThrow('No hay ítems de subproducto pendientes');
  });

  it('rechaza si el ítem seleccionado no es SUBPRODUCTO o no está pendiente', async () => {
    itemRepo.find.mockResolvedValue([
      { id: 3, pedidoId: 10, tipoProducto: 'SUBPRODUCTO', subproductoTipo: 'CHIP', tnEstimada: 12, estado: 'REMITIDO_PROVISORIO' },
    ]);
    await expect(service.emitirRemitoSubproducto(10, { itemIds: [3] } as any, adminUser)).rejects.toThrow('no pendiente');
  });
});
