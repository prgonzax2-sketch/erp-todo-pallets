import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SalidasStockService } from './salidas-stock.service.js';
import { SalidaStock } from './entities/salida-stock.entity.js';
import { SalidaStockDetalle } from './entities/salida-stock-detalle.entity.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { SubproductoEgreso } from '../conciliacion/entities/subproducto-egreso.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

describe('SalidasStockService', () => {
  const adminUser: AuthenticatedUser = { sub: 1, email: 'admin@test.com', rol: 'admin', aserradero: 'Norte' } as any;
  const operarioUser: AuthenticatedUser = { sub: 2, email: 'operario@test.com', rol: 'operario' } as any;

  const makeRepo = (over: any = {}) => ({
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn((d: any) => ({ ...d })),
    save: vi.fn(async (d: any) => ({ id: d.id || 1, ...d })),
    findOneBy: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    createQueryBuilder: vi.fn(),
    query: vi.fn(),
    ...over,
  });

  let salidaRepo: any, detalleRepo: any, prodRepo: any, clienteRepo: any, egRepo: any, manager: any, dataSource: any, service: SalidasStockService;

  beforeEach(() => {
    vi.clearAllMocks();
    salidaRepo = makeRepo();
    detalleRepo = makeRepo({ save: vi.fn(async (d: any) => ({ id: d?.id ?? 10, ...d })) });
    prodRepo = makeRepo();
    clienteRepo = makeRepo({ save: vi.fn(async (d: any) => ({ id: 10, ...d })) });
    egRepo = makeRepo({
      create: vi.fn((d: any) => ({ ...d })),
      save: vi.fn(async (d: any) => ({ id: d?.id ?? 99, ...d })),
      findOne: vi.fn(),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    });
    manager = {
      query: vi.fn().mockResolvedValue([{ maxn: 4 }]),
      getRepository: (entity: any) => {
        if (entity === SalidaStock) return salidaRepo;
        if (entity === SalidaStockDetalle) return detalleRepo;
        if (entity === ProduccionEntity) return prodRepo;
        if (entity === Cliente) return clienteRepo;
        if (entity === SubproductoEgreso) return egRepo;
        return makeRepo();
      },
    };
    dataSource = { transaction: vi.fn(async (fn: any) => fn(manager)) } as unknown as DataSource;
    service = new SalidasStockService(
      dataSource,
      salidaRepo as Repository<SalidaStock>,
      detalleRepo as Repository<SalidaStockDetalle>,
      prodRepo as Repository<ProduccionEntity>,
      clienteRepo as Repository<Cliente>,
    );
  });

  it('rechaza si el usuario no es admin', async () => {
    await expect(
      service.registrarSalida(
        { clienteNombre: 'Cliente X', cantidadSolicitada: 100, medidaSolicitada: '18x90x1200', items: [{ produccionId: 1, paquetesDespachados: 1 }] } as any,
        operarioUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('registra salida directa madera (compat), descuenta físico, correlativo robusto max+1, genera detalle financiero', async () => {
    const stock = { id: 5, lote: 'L-5', aserradero: 'Norte', tipoProducto: 'Tabla', descripcionProducto: 'Tabla Eucalipto', especie: 'Eucalipto', cantidadPaquetes: 10, cantidadReservada: 0, piezasPorPaquete: 500, espesor: 18, ancho: 90, largo: 1200, unidadDimensiones: 'MILIMETROS', separadores: [], tacos: [] };
    prodRepo.find.mockResolvedValue([stock]);
    prodRepo.findOne.mockResolvedValue({ ...stock }); // locked
    salidaRepo.save.mockImplementation(async (d: any) => ({ id: 1, ...d }));
    manager.query.mockResolvedValue([{ maxn: 4 }]);

    const res = await service.registrarSalida(
      { clienteNombre: 'Muebles SA', cantidadSolicitada: 2000, medidaSolicitada: '18x90x1200', items: [{ produccionId: 5, paquetesDespachados: 4 }] } as any,
      adminUser,
    );

    expect(prodRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 5, cantidadPaquetes: 6 }));
    expect(res.numeroRemito).toBe('REM-00005');
    expect(res.clienteNombre).toBe('Muebles SA');
    expect(res.totalPaquetesDespachados).toBe(4);
    expect(res.totalPiezasDespachadas).toBe(2000);
    expect(res.origenTipo).toBe('DIRECTA_MADERA');
    expect(res.estadoFacturacion).toBe('SIN_FACTURA');
    expect(detalleRepo.save).toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('falla si se solicitan más paquetes de los disponibles (considerando reservada)', async () => {
    const stock = { id: 5, lote: 'L-5', aserradero: 'Norte', cantidadPaquetes: 3, cantidadReservada: 1, piezasPorPaquete: 500, separadores: [], tacos: [] };
    prodRepo.find.mockResolvedValue([stock]);
    prodRepo.findOne.mockResolvedValue({ ...stock });
    await expect(
      service.registrarSalida({ clienteNombre: 'Muebles SA', cantidadSolicitada: 2500, medidaSolicitada: '18x90x1200', items: [{ produccionId: 5, paquetesDespachados: 3 }] } as any, adminUser),
    ).rejects.toThrow(BadRequestException);
  });

  it('anula salida directa legacy y reintegra stock (transaccional)', async () => {
    const salida = { id: 1, numeroRemito: 'REM-00001', aserradero: 'Norte', estado: 'CONFIRMADA', estadoDespacho: 'CONFIRMADO', estadoFacturacion: 'SIN_FACTURA', origenTipo: 'LEGACY', items: [{ produccionId: 5, paquetesDespachados: 4 }] };
    salidaRepo.findOne.mockResolvedValue(salida);
    prodRepo.findOne.mockResolvedValue({ id: 5, cantidadPaquetes: 6, cantidadReservada: 0 });
    salidaRepo.save.mockImplementation(async (d: any) => d);

    const res = await service.anularSalida(1, adminUser);
    expect(res.estado).toBe('ANULADA');
    expect(res.estadoDespacho).toBe('ANULADO');
    expect(prodRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 5, cantidadPaquetes: 10 }));
  });

  it('bloquea anulación de venta desde PEDIDO (supuesto MVP v1)', async () => {
    salidaRepo.findOne.mockResolvedValue({ id: 2, aserradero: 'Norte', estado: 'CONFIRMADA', estadoDespacho: 'CONFIRMADO', estadoFacturacion: 'SIN_FACTURA', origenTipo: 'PEDIDO', pedidoId: 7, items: [] });
    await expect(service.anularSalida(2, adminUser)).rejects.toThrow(BadRequestException);
  });

  it('listarSalidas devuelve {data, totales} con filtros', async () => {
    const qb: any = { leftJoinAndSelect: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), getMany: vi.fn().mockResolvedValue([{ subtotalNeto: 100, ivaMonto: 21, total: 121, totalP2Despachado: 10, toneladasTotal: 0, totalPaquetesDespachados: 2, m2Total: 0 }]) };
    salidaRepo.createQueryBuilder.mockReturnValue(qb);
    const res = await service.listarSalidas({ estadoFacturacion: 'SIN_FACTURA' }, adminUser);
    expect(res.data).toHaveLength(1);
    expect(res.totales.total).toBe(121);
    expect(res.totales.registros).toBe(1);
  });

  describe('confirmarBascula (F3)', () => {
    const baseSalida = () => ({
      id: 7,
      numeroRemito: 'REM-00007',
      fecha: '2026-03-01',
      aserradero: 'Norte',
      estado: 'CONFIRMADA',
      estadoDespacho: 'PENDIENTE_BASCULA',
      estadoFacturacion: 'SIN_FACTURA',
      origenTipo: 'DIRECTA_SUBPRODUCTO',
      basculaPendiente: true,
      total: 0,
      subtotalNeto: 0,
      ivaMonto: 0,
      items: [],
      detalles: [],
    });

    it('D-SP5 upsert: si det.subproductoEgresoId existe, actualiza egreso existente (sin duplicar) y conserva id', async () => {
      const det = { id: 11, tipoRenglon: 'SUBPRODUCTO', productoTipo: 'CHIP', productoEspecie: 'PINO', tnProvisionales: 10, tnReales: null, toneladas: 10, precioUnitario: 100, alicuotaIva: 0, total: 1000, importeNeto: 1000, ivaMonto: 0, cantidadBase: 10, subproductoEgresoId: 55, estadoLinea: 'PENDIENTE_BASCULA' };
      salidaRepo.findOne.mockResolvedValue(baseSalida());
      detalleRepo.find.mockResolvedValue([det]);
      egRepo.findOne.mockResolvedValue({ id: 55, createdAt: new Date('2026-01-01'), tnEstimadas: 10, tnReales: null });
      egRepo.save.mockImplementation(async (d: any) => ({ id: d?.id ?? 99, ...d }));
      salidaRepo.save.mockImplementation(async (d: any) => d);

      const res = await service.confirmarBascula(7, { lineas: [{ detalleId: 11, tnReales: 12 }] }, adminUser);

      expect(egRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 55 }) }));
      expect(egRepo.create).not.toHaveBeenCalled();
      expect(det.subproductoEgresoId).toBe(55);
      expect(res.basculaConfirmada).toBe(true);
    });

    it('D-SP5 cabecera: persiste remitoFisico/tipoComprobante/facturaNumero y recalcula estadoFacturacion', async () => {
      const det = { id: 11, tipoRenglon: 'SUBPRODUCTO', productoTipo: 'CHIP', productoEspecie: 'PINO', tnProvisionales: 10, toneladas: 10, precioUnitario: 100, alicuotaIva: 0, total: 1000, importeNeto: 1000, ivaMonto: 0, cantidadBase: 10, subproductoEgresoId: null, estadoLinea: 'PENDIENTE_BASCULA' };
      salidaRepo.findOne.mockResolvedValue(baseSalida());
      detalleRepo.find.mockResolvedValue([det]);
      salidaRepo.save.mockImplementation(async (d: any) => d);

      const res = await service.confirmarBascula(7, { lineas: [{ detalleId: 11, tnReales: 10 }], remitoFisicoNumero: ' RF-9 ', tipoComprobante: 'FC A', facturaNumero: '0001-1' }, adminUser);

      expect(res.remitoFisicoNumero).toBe('RF-9');
      expect(res.tipoComprobante).toBe('FC A');
      expect(res.facturaNumero).toBe('0001-1');
      expect(res.estadoFacturacion).toBe('FACTURADO');
      expect(res.facturadoAt).toBeTruthy();
    });

    it('D-SP6: precioPorTn definitivo actualiza detalle.precioUnitario y recalcula totales', async () => {
      const det = { id: 11, tipoRenglon: 'SUBPRODUCTO', productoTipo: 'CHIP', productoEspecie: 'PINO', tnProvisionales: 10, toneladas: 10, precioUnitario: 100, alicuotaIva: 21, total: 1210, importeNeto: 1000, ivaMonto: 210, cantidadBase: 10, subproductoEgresoId: null, estadoLinea: 'PENDIENTE_BASCULA' };
      const salida = baseSalida();
      salidaRepo.findOne.mockResolvedValue(salida);
      detalleRepo.find.mockResolvedValue([det]);
      salidaRepo.save.mockImplementation(async (d: any) => d);

      const res = await service.confirmarBascula(7, { lineas: [{ detalleId: 11, tnReales: 10, precioPorTn: 200 }] }, adminUser);

      expect(det.precioUnitario).toBe(200);
      expect(det.importeNeto).toBe(2000);
      expect(det.ivaMonto).toBe(420);
      expect(det.total).toBe(2420);
      expect(res.total).toBe(2420);
      expect(egRepo.save).toHaveBeenCalledWith(expect.objectContaining({ precioPorTn: 200 }));
    });
  });

  describe('anularSalida D-SP4', () => {
    it('permite anular pedido-subproducto provisional PENDIENTE_BASCULA SIN_FACTURA', async () => {
      const salida = { id: 3, aserradero: 'Norte', estado: 'CONFIRMADA', estadoDespacho: 'PENDIENTE_BASCULA', estadoFacturacion: 'SIN_FACTURA', origenTipo: 'PEDIDO', pedidoId: 7, basculaPendiente: true, items: [], detalles: [] };
      salidaRepo.findOne.mockResolvedValue(salida);
      salidaRepo.save.mockImplementation(async (d: any) => d);

      const res = await service.anularSalida(3, adminUser, 'camión cancelado');
      expect(res.estado).toBe('ANULADA');
      expect(res.estadoDespacho).toBe('ANULADO');
      expect(res.anuladoMotivo).toBe('camión cancelado');
    });

    it('elimina egresos vinculados al anular provisional D-SP4 (si existen)', async () => {
      const salida = { id: 3, aserradero: 'Norte', estado: 'CONFIRMADA', estadoDespacho: 'PENDIENTE_BASCULA', estadoFacturacion: 'SIN_FACTURA', origenTipo: 'PEDIDO', pedidoId: 7, basculaPendiente: true, items: [], detalles: [{ id: 1, subproductoEgresoId: 88 }] };
      salidaRepo.findOne.mockResolvedValue(salida);
      salidaRepo.save.mockImplementation(async (d: any) => d);

      await service.anularSalida(3, adminUser);
      expect(egRepo.delete).toHaveBeenCalled();
      expect(detalleRepo.save).toHaveBeenCalledWith(expect.objectContaining({ subproductoEgresoId: null }));
    });

    it('bloquea anulación PEDIDO+CONFIRMADO (fuera de excepción D-SP4)', async () => {
      salidaRepo.findOne.mockResolvedValue({ id: 2, aserradero: 'Norte', estado: 'CONFIRMADA', estadoDespacho: 'CONFIRMADO', estadoFacturacion: 'SIN_FACTURA', origenTipo: 'PEDIDO', pedidoId: 7, basculaPendiente: false, items: [], detalles: [] });
      await expect(service.anularSalida(2, adminUser)).rejects.toThrow(BadRequestException);
    });

    it('bloquea anulación FACTURADO aunque sea PEDIDO provisional', async () => {
      salidaRepo.findOne.mockResolvedValue({ id: 2, aserradero: 'Norte', estado: 'CONFIRMADA', estadoDespacho: 'PENDIENTE_BASCULA', estadoFacturacion: 'FACTURADO', origenTipo: 'PEDIDO', pedidoId: 7, basculaPendiente: true, items: [], detalles: [] });
      await expect(service.anularSalida(2, adminUser)).rejects.toThrow(BadRequestException);
    });
  });
});