import { describe, expect, it } from 'vitest';
import { calcularP2Asignacion, matchMedidaTolerante, ordenarCandidatosTolerantes } from './pedidos.utils.js';

describe('pedidos.utils D1 matching ±1mm', () => {
  it('25x100x3000 vs 26x100x3000 => match (1mm espesor)', () => {
    const r = matchMedidaTolerante({ espesor: 25, ancho: 100, largo: 3000 }, { espesor: 26, ancho: 100, largo: 3000 });
    expect(r.match).toBe(true);
    expect(r.difiere).toBe(true);
    expect(r.dE).toBe(1);
  });

  it('27mm espesor => no match (2mm)', () => {
    const r = matchMedidaTolerante({ espesor: 25, ancho: 100, largo: 3000 }, { espesor: 27, ancho: 100, largo: 3000 });
    expect(r.match).toBe(false);
  });

  it('±1 en ancho y largo => match', () => {
    expect(matchMedidaTolerante({ espesor: 25, ancho: 100, largo: 3000 }, { espesor: 25, ancho: 101, largo: 2999 }).match).toBe(true);
  });

  it('2mm en cualquier dim => no match', () => {
    expect(matchMedidaTolerante({ espesor: 25, ancho: 100, largo: 3000 }, { espesor: 25, ancho: 102, largo: 3000 }).match).toBe(false);
  });

  it('ordena exacto primero, luego menor delta, luego disponible', () => {
    const items = [
      { id: 1, difiere: true, sumaDelta: 1, disponible: 10 },
      { id: 2, difiere: false, sumaDelta: 0, disponible: 1 },
      { id: 3, difiere: true, sumaDelta: 1, disponible: 20 },
    ];
    expect(ordenarCandidatosTolerantes(items).map(i => i.id)).toEqual([2, 3, 1]);
  });
});

describe('pedidos.utils P2/kg D3,D8,R3', () => {
  it('calcula P2 solicitado con medida solicitada y guarda diferencia vs real', () => {
    const r = calcularP2Asignacion({
      paquetes: 2,
      piezasPorPaquete: 10,
      medidaSolicitada: { espesor: 25, ancho: 100, largo: 3000 },
      medidaReal: { espesor: 26, ancho: 100, largo: 3000 },
      separadores: [],
      tacos: [],
    });
    expect(r.tablas).toBe(20);
    expect(r.p2Solicitado).not.toBe(r.p2Real);
    expect(r.kgEstimados).toBe(Math.round(r.p2Solicitado * 2.2 * 1000) / 1000);
  });

  it('suma componentes fisicos (separadores/tacos) en ambos totales', () => {
    const r = calcularP2Asignacion({
      paquetes: 1,
      piezasPorPaquete: 1,
      medidaSolicitada: { espesor: 10, ancho: 10, largo: 1000 },
      medidaReal: { espesor: 10, ancho: 10, largo: 1000 },
      separadores: [{ cantidad: 2, medida: { espesor: 10, ancho: 10, largo: 100 } }],
      tacos: [],
    });
    expect(r.p2Separadores).toBeGreaterThan(0);
    expect(r.p2Solicitado).toBe(r.p2Real);
  });
});


  it('gran volumen 12000 unidades: P2 y kg escalan correctamente', () => {
    const r = calcularP2Asignacion({
      paquetes: 24,
      piezasPorPaquete: 500, // 12000 tablas
      medidaSolicitada: { espesor: 25, ancho: 100, largo: 3000 },
      medidaReal: { espesor: 25, ancho: 100, largo: 3000 },
      separadores: [{ cantidad: 2, medida: { espesor: 18, ancho: 90, largo: 1000 } }],
      tacos: [],
    });
    expect(r.tablas).toBe(12000);
    expect(r.p2Solicitado).toBeGreaterThan(0);
    expect(r.kgEstimados).toBe(Math.round(r.p2Solicitado * 2.2 * 1000) / 1000);
    expect(Number.isFinite(r.p2Solicitado)).toBe(true);
  });

  it('componentes diferentes producen P2/Paq diferente (R3)', () => {
    const base = { paquetes: 1, piezasPorPaquete: 500, medidaSolicitada: { espesor: 25, ancho: 100, largo: 3000 }, medidaReal: { espesor: 25, ancho: 100, largo: 3000 } };
    const a = calcularP2Asignacion({ ...base, separadores: [{ cantidad: 1, medida: { espesor: 18, ancho: 90, largo: 1000 } }], tacos: [] });
    const b = calcularP2Asignacion({ ...base, separadores: [{ cantidad: 12, medida: { espesor: 18, ancho: 90, largo: 1000 } }], tacos: [{ cantidad: 2, medida: { espesor: 90, ancho: 90, largo: 1150 } }] });
    expect(b.p2Solicitado).toBeGreaterThan(a.p2Solicitado);
  });
