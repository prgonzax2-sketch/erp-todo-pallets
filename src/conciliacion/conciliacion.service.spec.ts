import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ConciliacionService } from './conciliacion.service.js';

const adminGeneral = { sub: 1, email: 'a@t.com', rol: 'admin', aserradero: null } as any;

function qbRows(rows: any[]) {
  const qb: any = {
    where: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(), addSelect: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(), addGroupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(), addOrderBy: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getMany: vi.fn(async () => rows), getRawOne: vi.fn(async () => null), getRawMany: vi.fn(async () => []), getManyAndCount: vi.fn(async () => [rows, rows.length]),
  };
  return qb;
}

describe('ConciliacionService', () => {
  it('suma variedades pino+euca (ponderada por especie) y componente hereda especie paquete', async () => {
    // 2 registros: PINO paquete 1x10x25x100x3000mm, y EUCALIPTO con separador sin especie (hereda EUCALIPTO)
    const prodRows = [
      { especie: 'PINO', cantidadPaquetes: 1, piezasPorPaquete: 10, espesor: 25, ancho: 100, largo: 3000, unidadDimensiones: 'MM', separadores: [], tacos: [] },
      { especie: 'EUCALIPTO', cantidadPaquetes: 1, piezasPorPaquete: 5, espesor: 25, ancho: 100, largo: 3000, unidadDimensiones: 'MM', separadores: [{ cantidad: 2, medida: { espesor: 25, ancho: 25, largo: 3000 } }], tacos: [] },
    ];
    const prodRepo = { createQueryBuilder: vi.fn(() => qbRows(prodRows)) } as any;
    const ingresoRepo = { createQueryBuilder: vi.fn(() => qbRows([])) } as any;
    const conteoRepo = { findOne: vi.fn(async () => null) } as any;
    const egresoRepo = { createQueryBuilder: vi.fn(() => qbRows([])), create: vi.fn((x)=>x), save: vi.fn(async(x)=>({id:1,...x})), findOne: vi.fn(async()=>null) } as any;
    const svc = new ConciliacionService(prodRepo, ingresoRepo, conteoRepo, egresoRepo);

    const p2 = await svc.p2PorEspecie('Norte', '2026-11-01', '2026-11-07');
    expect(p2.p2PorEspecie.PINO).toBeCloseTo(31.8, 1); // 10 piezas * 3.18
    expect(p2.p2PorEspecie.EUCALIPTO).toBeGreaterThan(15); // 5*3.18 + separador hereda EUCALIPTO
    expect(p2.p2TotalSumaVariedades).toBeCloseTo(p2.p2PorEspecie.PINO + p2.p2PorEspecie.EUCALIPTO + p2.p2PorEspecie.MEZCLA + p2.p2PorEspecie.OTRO, 2);

    const consumo = svc.consumoDesdeP2(p2.p2PorEspecie);
    expect(consumo.tnConsumoEstimado).toBeGreaterThan(0);
    expect(consumo.detalle.PINO.coef.coefAserrin).toBeCloseTo(0.2025, 6);
    expect(consumo.detalle.EUCALIPTO.coef.coefAserrin).toBeCloseTo(0.27, 6);
  });

  it('D1 egreso TN diferida: exige tnEstimadas explícita al cargar (sin default) y confirmar real pasa a CONFIRMADO/AJUSTADO', async () => {
    let saved: any = null;
    const egresoRepo = {
      create: vi.fn((x) => x),
      save: vi.fn(async (x) => { saved = { id: 1, ...x }; return saved; }),
      findOne: vi.fn(async () => ({ id: 1, aserradero: 'Norte', tnEstimadas: 28, estado: 'ESTIMADO' })),
      createQueryBuilder: vi.fn(() => qbRows([])),
    } as any;
    const svc = new ConciliacionService({ createQueryBuilder: vi.fn(()=>qbRows([])) } as any, { createQueryBuilder: vi.fn(()=>qbRows([])) } as any, { findOne: vi.fn(async()=>null) } as any, egresoRepo);

    // sin tnEstimadas => rechazo (decisión obligatoria)
    await expect(svc.createEgreso({ tipo: 'ASERRIN', fecha: '2026-11-07', aserradero: 'Norte' } as any, adminGeneral)).rejects.toMatchObject({ status: 400 });

    const created = await svc.createEgreso({ tipo: 'ASERRIN', fecha: '2026-11-07', aserradero: 'Norte', tnEstimadas: 28 } as any, adminGeneral);
    expect(created.tnEstimadas).toBe(28);
    expect(created.estado).toBe('ESTIMADO');

    const conf = await svc.confirmarEgreso(1, { tnReales: 28 } as any, adminGeneral);
    expect(conf.estado).toBe('CONFIRMADO');
    expect(conf.tnReales).toBe(28);
  });

  it('rechaza no-admin', async () => {
    const svc = new ConciliacionService({} as any, {} as any, {} as any, {} as any);
    await expect(svc.conciliacion({ rol: 'operario' } as any, 'Norte')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CA2/D-TODOS: global agregado suma aditivo (P²/consumo/generado/egresos) periodo, SIN remanente/cierre físico', async () => {
    // Norte: PINO 1*10*25x100x3000mm=31.8 P²; Sur: EUCALIPTO 1*5*25x100x3000mm=15.9 P²
    const prodRows = [
      { aserradero: 'Norte', especie: 'PINO', cantidadPaquetes: 1, piezasPorPaquete: 10, espesor: 25, ancho: 100, largo: 3000, unidadDimensiones: 'MM', separadores: [], tacos: [] },
      { aserradero: 'Sur', especie: 'EUCALIPTO', cantidadPaquetes: 1, piezasPorPaquete: 5, espesor: 25, ancho: 100, largo: 3000, unidadDimensiones: 'MM', separadores: [], tacos: [] },
    ];
    const prodRepo = { createQueryBuilder: vi.fn(() => qbRows(prodRows)) } as any;
    const ingresoRepo = { createQueryBuilder: vi.fn(() => qbRows([])) } as any;
    const conteoRepo = { findOne: vi.fn(async () => null) } as any;
    // egresos globales: 2 TN ASERRIN
    const egQb = qbRows([]);
    egQb.getRawMany = vi.fn(async () => [{ tipo: 'ASERRIN', estado: 'CONFIRMADO', cantidad: '1', tnEstimadas: '2', tnEfectivas: '2', pendientes: '0' }]);
    const egresoRepo = { createQueryBuilder: vi.fn(() => egQb), create: vi.fn((x: any) => x), save: vi.fn(async (x: any) => ({ id: 1, ...x })), findOne: vi.fn(async () => null) } as any;
    // config con factores TN para que TN esté disponible (ambos aserraderos usan loadOverrides por aserradero; mock devuelve factores)
    const configRepo = { find: vi.fn(async () => [
      { grupoEspecie: 'PINO', factorTnAserrin: 0.3, factorTnChip: 0.25, activo: true },
      { grupoEspecie: 'EUCALIPTO', factorTnAserrin: 0.3, factorTnChip: 0.25, activo: true },
    ]) } as any;
    const svc = new ConciliacionService(prodRepo, ingresoRepo, conteoRepo, egresoRepo, configRepo);

    const res = await svc.conciliacionGlobalAgregado(adminGeneral, '2026-11-01', '2026-11-07');
    expect(res.scope).toBe('global_agregado');
    expect(res.aserradero).toBeNull();
    expect(res.periodo).toEqual({ desde: '2026-11-01', hasta: '2026-11-07' });
    // físicos NUNCA consolidados
    expect(res.ultimoCierre).toBeNull();
    expect(res.ingresosPostCierre).toBeNull();
    expect(res.tnRollosEsperadosEnPlaya).toBeNull();
    expect(res.m3RollosEsperadosEnPlayaAprox).toBeNull();
    // aditivo P²/consumo/generado
    expect(res.produccionP2PostCierre.p2PorEspecie.PINO).toBeCloseTo(31.8, 1);
    expect(res.produccionP2PostCierre.p2PorEspecie.EUCALIPTO).toBeCloseTo(15.9, 1);
    expect(res.produccionP2PostCierre.p2TotalSumaVariedades).toBeCloseTo(47.7, 1);
    expect(res.consumoEstimado.tnConsumoEstimado).toBeGreaterThan(0);
    expect(res.subproductos.generadoEstimadoM3.aserrin).toBeGreaterThan(0);
    expect(res.subproductos.generadoEstimadoM3.chip).toBeGreaterThan(0);
    // TN disponible (factores configurados en mock)
    expect(res.subproductos.generadoEstimadoTn.aserrin).not.toBeNull();
    expect(res.subproductos.generadoEstimadoTn.chip).not.toBeNull();
    // egresos globales
    expect((res.subproductos.egresosResumen || []).length).toBeGreaterThan(0);
    // notas explícitas
    expect((res.notas || []).join(' ')).toMatch(/Remanente\/cierre f[ií]sico es por planta/i);
  });

  it('CA1/D-TN fallback defaults: sin override guardado usa factor TN por defecto inicial (calibrable) y calcula TN estimada', async () => {
    const prodRows = [
      { aserradero: 'Norte', especie: 'PINO', cantidadPaquetes: 1, piezasPorPaquete: 10, espesor: 25, ancho: 100, largo: 3000, unidadDimensiones: 'MM', separadores: [], tacos: [] },
    ];
    const prodRepo = { createQueryBuilder: vi.fn(() => qbRows(prodRows)) } as any;
    const egQb = qbRows([]); egQb.getRawMany = vi.fn(async () => []);
    const egresoRepo = { createQueryBuilder: vi.fn(() => egQb), create: vi.fn((x: any) => x), save: vi.fn(async (x: any) => x), findOne: vi.fn(async () => null) } as any;
    // sin configRepo/override => aplica DEFAULTS_COEF (incl. factorTnAserrin/Chip default inicial calibrable)
    const svc = new ConciliacionService(prodRepo, {} as any, {} as any, egresoRepo);

    const res = await svc.conciliacionGlobalAgregado(adminGeneral, '2026-11-01', '2026-11-07');
    expect(res.scope).toBe('global_agregado');
    expect(res.subproductos.generadoEstimadoM3.aserrin).toBeGreaterThan(0);
    // TN disponible vía default (override por aserradero+especie puede ajustar/calibrar)
    expect(res.subproductos.generadoEstimadoTn.aserrin).not.toBeNull();
    expect(res.subproductos.generadoEstimadoTn.chip).not.toBeNull();
    expect(res.subproductos.generadoEstimadoTn.aserrin).toBeGreaterThan(0);
    expect(res.ultimoCierre).toBeNull();
  });

  it('CA4: admin asignado rechazado en agregado global (sin acceso cross-planta)', async () => {
    const svc = new ConciliacionService({} as any, {} as any, {} as any, {} as any);
    const adminAsignado = { sub: 2, email: 'asig@t.com', rol: 'admin', aserradero: 'Norte' } as any;
    await expect(svc.conciliacionGlobalAgregado(adminAsignado, '2026-11-01', '2026-11-07')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CA5 compat: conciliación por planta (sin global) mantiene contrato/remanente físico', async () => {
    const prodRows = [{ especie: 'PINO', cantidadPaquetes: 1, piezasPorPaquete: 10, espesor: 25, ancho: 100, largo: 3000, unidadDimensiones: 'MM', separadores: [], tacos: [] }];
    const prodRepo = { createQueryBuilder: vi.fn(() => qbRows(prodRows)) } as any;
    const ingresoRepo = { createQueryBuilder: vi.fn(() => qbRows([])) } as any;
    const conteoRepo = { findOne: vi.fn(async () => ({ id: 1, fechaCierre: '2026-11-01', totalTn: 10, totalM3: 12, factorTnPlaya: 1 })) } as any;
    const egQb = qbRows([]); egQb.getRawMany = vi.fn(async () => []);
    const egresoRepo = { createQueryBuilder: vi.fn(() => egQb), create: vi.fn((x: any) => x), save: vi.fn(async (x: any) => x), findOne: vi.fn(async () => null) } as any;
    const svc = new ConciliacionService(prodRepo, ingresoRepo, conteoRepo, egresoRepo);
    const res = await svc.conciliacion(adminGeneral, 'Norte');
    expect(res.aserradero).toBe('Norte');
    expect(res.ultimoCierre).not.toBeNull();
    expect(res.scope).toBeUndefined(); // contrato actual sin scope global
  });
});
