import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DashboardService } from './dashboard.service.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { IngresoRollo } from '../ingreso-rollos/entities/ingreso-rollo.entity.js';
import { Adelanto } from '../adelantos/entities/adelanto.entity.js';
import { Liquidacion } from '../liquidaciones/entities/liquidacion.entity.js';
import { GastoComprobante } from '../gastos/entities/gasto-comprobante.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { clasificarSubproducto } from './subproductos.util.js';
import { calcularRangoPeriodo } from './dashboard-periodo.util.js';

const adminGeneral: AuthenticatedUser = { sub: 1, email: 'gral@test.com', rol: 'admin', aserradero: null };
const adminAsignado: AuthenticatedUser = { sub: 2, email: 'asig@test.com', rol: 'admin', aserradero: 'Norte' };
const operario: AuthenticatedUser = { sub: 3, email: 'op@test.com', rol: 'operario' };

function qbMock(opts: { rawOne?: any; rawMany?: any; getMany?: any }) {
  const qb: any = {};
  qb.select = vi.fn(() => qb);
  qb.addSelect = vi.fn(() => qb);
  qb.where = vi.fn(() => qb);
  qb.andWhere = vi.fn(() => qb);
  qb.innerJoin = vi.fn(() => qb);
  qb.getRawOne = vi.fn(async () => opts.rawOne ?? null);
  qb.getRawMany = vi.fn(async () => opts.rawMany ?? []);
  qb.getMany = vi.fn(async () => opts.getMany ?? []);
  return qb;
}

describe('DashboardService', () => {
  let service: DashboardService;
  let produccionRepo: any;
  let ingresoRollosRepo: any;
  let adelantoRepo: any;
  let liquidacionRepo: any;
  let gastosRepo: any;

  const emptyProduccionTotals = { registros: '0', paquetes: '0', piezas: '0' };
  const emptyRollos = { registros: '0', toneladas: '0', m3: '0', totalMadera: '0' };
  const emptyAdelantos = { cantidad: '0', monto: '0', montoEntregado: '0' };
  const emptyLiquidaciones = { cantidad: '0', totalPagado: '0', totalGenerado: '0' };
  const emptyGastos = { subtotalNeto: '0', iva: '0', otrosTributos: '0', total: '0' };

  function setupHappyDefaults() {
    produccionRepo.createQueryBuilder
      .mockReturnValueOnce(qbMock({ rawOne: { registros: '2', paquetes: '5', piezas: '100' } }))
      .mockReturnValueOnce(qbMock({ getMany: [] }));
    ingresoRollosRepo.createQueryBuilder.mockReturnValueOnce(
      qbMock({ rawOne: { registros: '1', toneladas: '30.5', m3: '12', totalMadera: '5445000' } }),
    );
    adelantoRepo.createQueryBuilder.mockReturnValueOnce(
      qbMock({ rawOne: { cantidad: '3', monto: '150000', montoEntregado: '120000' } }),
    );
    liquidacionRepo.createQueryBuilder.mockReturnValueOnce(
      qbMock({ rawOne: { cantidad: '1', totalPagado: '500000', totalGenerado: '650000' } }),
    );
    gastosRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyGastos }));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00.000Z'));

    produccionRepo = { createQueryBuilder: vi.fn() };
    ingresoRollosRepo = { createQueryBuilder: vi.fn() };
    adelantoRepo = { createQueryBuilder: vi.fn() };
    liquidacionRepo = { createQueryBuilder: vi.fn() };
    gastosRepo = { createQueryBuilder: vi.fn() };

    service = new DashboardService(
      produccionRepo as unknown as Repository<ProduccionEntity>,
      ingresoRollosRepo as unknown as Repository<IngresoRollo>,
      adelantoRepo as unknown as Repository<Adelanto>,
      liquidacionRepo as unknown as Repository<Liquidacion>,
      gastosRepo as unknown as Repository<GastoComprobante>,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rechaza rol no admin (403)', async () => {
    await expect(service.getStats({}, operario)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('defaults: periodo day, fechaRef hoy local, scope global para admin general', async () => {
    setupHappyDefaults();
    const res = await service.getStats({}, adminGeneral);

    expect(res.meta.periodo).toBe('day');
    // todayYmdLocal() usa hora local del sistema fakeado (Date local)
    expect(res.meta.fechaRef).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.meta.desde).toBe(res.meta.fechaRef);
    expect(res.meta.hasta).toBe(res.meta.fechaRef);
    expect(res.meta.aserradero).toBeNull();
    expect(res.meta.scope).toBe('global');
  });

  it('scope general_filtrado cuando admin general pasa aserradero', async () => {
    setupHappyDefaults();
    const res = await service.getStats({ aserradero: 'Sur' }, adminGeneral);
    expect(res.meta.scope).toBe('general_filtrado');
    expect(res.meta.aserradero).toBe('Sur');

    // Verifica que el filtro de aserradero se aplicó en producción (primer QB)
    const prodTotalsQb = produccionRepo.createQueryBuilder.mock.results[0].value;
    expect(prodTotalsQb.andWhere).toHaveBeenCalledWith('p.aserradero = :aserradero', { aserradero: 'Sur' });
  });

  it('scope asignado fuerza aserradero del usuario e ignora query igual', async () => {
    setupHappyDefaults();
    const res = await service.getStats({ aserradero: 'Norte' }, adminAsignado);
    expect(res.meta.scope).toBe('asignado');
    expect(res.meta.aserradero).toBe('Norte');
  });

  it('asignado rechaza (400) si filtra otro aserradero explícitamente', async () => {
    await expect(service.getStats({ aserradero: 'Sur' }, adminAsignado)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('respeta periodo=week (lunes-domingo)', async () => {
    setupHappyDefaults();
    // 2026-11-07 es sábado => semana lun 2026-11-02 a dom 2026-11-08
    const res = await service.getStats({ periodo: 'week', fecha: '2026-11-07' }, adminGeneral);
    expect(res.meta.periodo).toBe('week');
    expect(res.meta.fechaRef).toBe('2026-11-07');
    expect(res.meta.desde).toBe('2026-11-02');
    expect(res.meta.hasta).toBe('2026-11-08');
  });

  it('respeta periodo=month (mes calendario)', async () => {
    setupHappyDefaults();
    const res = await service.getStats({ periodo: 'month', fecha: '2026-11-07' }, adminGeneral);
    expect(res.meta.periodo).toBe('month');
    expect(res.meta.desde).toBe('2026-11-01');
    expect(res.meta.hasta).toBe('2026-11-30');
  });

  it('devuelve shape con placeholders m3/consumoReal + gastosGenerales real CONFIRMADO + p2 aditivo (CA3/CA5)', async () => {
    setupHappyDefaults();
    const res = await service.getStats({ fecha: '2026-11-07' }, adminGeneral);

    expect(res.produccion.registros).toBe(2);
    expect(res.produccion.paquetes).toBe(5);
    expect(res.produccion.piezas).toBe(100);
    expect(res.produccion.m3).toBeNull();
    expect(res.produccion.m3Nota).toContain('m³ no calculado en v1');
    // P² aditivo (CA3): sin filas => 0, estimado, compat campos previos intactos
    expect(res.produccion.p2).toBe(0);
    expect(res.produccion.p2Nota).toContain('Estimado');
    // Subproductos generados TN (P²-based): sin producción => 0 TN
    expect(res.produccion.subproductosGenerados).toBeTruthy();
    expect(res.produccion.subproductosGenerados.aserrinTn).toBe(0);
    expect(res.produccion.subproductosGenerados.chipTn).toBe(0);

    expect(res.rollos.etiqueta).toContain('Recepción de rollos');
    expect(res.rollos.toneladas).toBe(30.5);
    expect(res.rollos.consumoReal).toBeNull();
    expect(res.rollos.nota).toContain('Consumo real pendiente');

    expect(res.honorarios.adelantos).toEqual({ cantidad: 3, monto: 150000, montoEntregado: 120000 });
    expect(res.honorarios.liquidaciones).toEqual({ cantidad: 1, totalPagado: 500000, totalGenerado: 650000 });
    expect(res.honorarios.nota).toContain('solaparse contablemente');

    expect(res.gastosGenerales).toEqual({
      disponible: true,
      estado: 'ok',
      periodo: { desde: '2026-11-07', hasta: '2026-11-07' },
      scope: 'global',
      aserradero: null,
      items: [],
      subtotalNeto: 0,
      iva: 0,
      otrosTributos: 0,
      total: 0,
      nota: 'Egresos operativos confirmados en el período.',
    });
  });

  it('gastosGenerales suma solo CONFIRMADO en rango/scope y respeta aserradero', async () => {
    produccionRepo.createQueryBuilder
      .mockReturnValueOnce(qbMock({ rawOne: emptyProduccionTotals }))
      .mockReturnValueOnce(qbMock({ getMany: [] }));
    ingresoRollosRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyRollos }));
    adelantoRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyAdelantos }));
    liquidacionRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyLiquidaciones }));
    gastosRepo.createQueryBuilder.mockReturnValueOnce(
      qbMock({ rawOne: { subtotalNeto: '1000.50', iva: '210.10', otrosTributos: '15', total: '1225.60' } }),
    );

    const res = await service.getStats({ fecha: '2026-11-07', aserradero: 'Sur' }, adminGeneral);

    const gastosQb = gastosRepo.createQueryBuilder.mock.results[0].value;
    expect(gastosQb.where).toHaveBeenCalledWith('g.estado = :estado', { estado: 'CONFIRMADO' });
    expect(gastosQb.andWhere).toHaveBeenCalledWith('g.fecha >= :desde', { desde: '2026-11-07' });
    expect(gastosQb.andWhere).toHaveBeenCalledWith('g.fecha <= :hasta', { hasta: '2026-11-07' });
    expect(gastosQb.andWhere).toHaveBeenCalledWith('g.aserraderoNombre = :aserradero', { aserradero: 'Sur' });
    expect(res.gastosGenerales).toMatchObject({
      disponible: true,
      estado: 'ok',
      scope: 'general_filtrado',
      aserradero: 'Sur',
      subtotalNeto: 1000.5,
      iva: 210.1,
      otrosTributos: 15,
      total: 1225.6,
    });
  });

  it('CA3: calcula P² producido (suma variedades, estimado) con herencia especie en componentes y preserva compat', async () => {
    // PINO: 1 paq * 10 pzas * 25x100x3000mm = 31.8 P²
    // EUCALIPTO + separador sin especie (hereda EUCALIPTO): 1*5*25x100x3000 (=15.9) + calcP2Component(1,{cantidad:2,25x25x3000}) (=1.59) => 17.49
    const prodRows = [
      { especie: 'PINO', tipoProducto: 'Tabla', descripcionProducto: '', cantidadPaquetes: 1, piezasPorPaquete: 10, espesor: 25, ancho: 100, largo: 3000, unidadDimensiones: 'MM', separadores: [], tacos: [] },
      { especie: 'EUCALIPTO', tipoProducto: 'Tabla', descripcionProducto: '', cantidadPaquetes: 1, piezasPorPaquete: 5, espesor: 25, ancho: 100, largo: 3000, unidadDimensiones: 'MM', separadores: [{ cantidad: 2, medida: { espesor: 25, ancho: 25, largo: 3000 } }], tacos: [] },
    ];
    produccionRepo.createQueryBuilder
      .mockReturnValueOnce(qbMock({ rawOne: { registros: '2', paquetes: '2', piezas: '15' } }))
      .mockReturnValueOnce(qbMock({ getMany: prodRows }));
    ingresoRollosRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyRollos }));
    adelantoRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyAdelantos }));
    liquidacionRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyLiquidaciones }));
    gastosRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyGastos }));

    const res = await service.getStats({ fecha: '2026-11-07' }, adminGeneral);
    expect(res.produccion.p2).toBeCloseTo(49.29, 1); // ~31.8 + ~17.49
    expect(res.produccion.p2Nota).toContain('Estimado');
    // compat preservada
    expect(res.produccion.registros).toBe(2);
    expect(res.produccion.paquetes).toBe(2);
    expect(res.produccion.piezas).toBe(15);
    expect(res.produccion.m3).toBeNull();
    expect(res.produccion.subproductos).toBeTruthy();
  });

  it('clasifica subproductos aserrín/chip y ceros sin coincidencias', async () => {
    produccionRepo.createQueryBuilder
      .mockReturnValueOnce(qbMock({ rawOne: { registros: '3', paquetes: '6', piezas: '60' } }))
      .mockReturnValueOnce(
        qbMock({
          getMany: [
            { tipoProducto: 'Aserrín', descripcionProducto: '', cantidadPaquetes: 2, piezasPorPaquete: 1 },
            { tipoProducto: 'SERRIN', descripcionProducto: '', cantidadPaquetes: 1, piezasPorPaquete: 1 },
            { tipoProducto: 'CHIP', descripcionProducto: '', cantidadPaquetes: 3, piezasPorPaquete: 10 },
            { tipoProducto: 'Tabla', descripcionProducto: '', cantidadPaquetes: 10, piezasPorPaquete: 10 },
          ],
        }),
      );
    ingresoRollosRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyRollos }));
    adelantoRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyAdelantos }));
    liquidacionRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyLiquidaciones }));
    gastosRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyGastos }));

    const res = await service.getStats({ fecha: '2026-11-07' }, adminGeneral);
    expect(res.produccion.subproductos.aserrin).toEqual({ registros: 2, paquetes: 3, piezas: 3 });
    expect(res.produccion.subproductos.chip).toEqual({ registros: 1, paquetes: 3, piezas: 30 });
    expect(res.produccion.subproductos.clasificacion).toBe('heuristica_tipoProducto_v1');

    // Sin coincidencias (ya verificado por fila Tabla ignorada; caso puro)
    expect(clasificarSubproducto('Tabla', null)).toBeNull();
  });

  it('scope asignado aplica filtro por empleado.aserradero en honorarios', async () => {
    produccionRepo.createQueryBuilder
      .mockReturnValueOnce(qbMock({ rawOne: emptyProduccionTotals }))
      .mockReturnValueOnce(qbMock({ getMany: [] }));
    ingresoRollosRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyRollos }));
    adelantoRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyAdelantos }));
    liquidacionRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyLiquidaciones }));
    gastosRepo.createQueryBuilder.mockReturnValueOnce(qbMock({ rawOne: emptyGastos }));

    await service.getStats({ fecha: '2026-11-07' }, adminAsignado);

    const adelQb = adelantoRepo.createQueryBuilder.mock.results[0].value;
    expect(adelQb.innerJoin).toHaveBeenCalledWith('a.empleado', 'e');
    expect(adelQb.andWhere).toHaveBeenCalledWith('e.aserradero = :aserradero', { aserradero: 'Norte' });

    const liqQb = liquidacionRepo.createQueryBuilder.mock.results[0].value;
    expect(liqQb.innerJoin).toHaveBeenCalledWith('l.empleado', 'e');
    expect(liqQb.andWhere).toHaveBeenCalledWith('e.aserradero = :aserradero', { aserradero: 'Norte' });
  });

  it('util periodo calcula rangos day/week/month (lunes-domingo)', () => {
    expect(calcularRangoPeriodo('day', '2026-11-07')).toMatchObject({
      desde: '2026-11-07',
      hasta: '2026-11-07',
    });
    expect(calcularRangoPeriodo('week', '2026-11-07')).toMatchObject({
      desde: '2026-11-02',
      hasta: '2026-11-08',
    });
    expect(calcularRangoPeriodo('week', '2026-11-01')).toMatchObject({
      // 2026-11-01 domingo => semana lun 2026-10-26 a dom 2026-11-01
      desde: '2026-10-26',
      hasta: '2026-11-01',
    });
    expect(calcularRangoPeriodo('month', '2026-02-15')).toMatchObject({
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
  });

  it('rechaza periodo inválido (400)', async () => {
    await expect(service.getStats({ periodo: 'foo' as any, fecha: '2026-11-07' }, adminGeneral)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza fecha inválida (400)', async () => {
    await expect(service.getStats({ fecha: '2026-99-99' }, adminGeneral)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getStats({ fecha: 'nope' }, adminGeneral)).rejects.toBeInstanceOf(BadRequestException);
  });
});
