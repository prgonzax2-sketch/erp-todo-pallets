import { describe, expect, it } from 'vitest';
import { calcularIngresoRollo, round2 } from './ingreso-rollos.calculos.js';

describe('ingreso-rollos.calculos', () => {
  it('round2 redondea a 2 decimales', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(0)).toBe(0);
  });

  it('calcula madera + IVA 21% y flete server-side', () => {
    const r = calcularIngresoRollo({ toneladas: 30, precioTnMadera: 150000, precioFleteTn: 18000, ajustesAdicionalesFlete: 5000 });
    expect(r.subtotalBruto).toBe(4500000);
    expect(r.iva).toBe(945000);
    expect(r.totalMadera).toBe(5445000);
    expect(r.subtotalFlete).toBe(540000);
    expect(r.totalFleteViaje).toBe(545000);
  });

  it('maneja null/0/cero de forma segura', () => {
    const r = calcularIngresoRollo({ toneladas: null, precioTnMadera: undefined, precioFleteTn: 0, ajustesAdicionalesFlete: null });
    expect(r).toEqual({ subtotalBruto: 0, iva: 0, totalMadera: 0, subtotalFlete: 0, totalFleteViaje: 0 });
  });

  it('permite ajustes de flete negativos (descuento)', () => {
    const r = calcularIngresoRollo({ toneladas: 10, precioTnMadera: 0, precioFleteTn: 100, ajustesAdicionalesFlete: -50 });
    expect(r.subtotalFlete).toBe(1000);
    expect(r.totalFleteViaje).toBe(950);
  });

  it('no produce NaN con entradas inválidas', () => {
    const r = calcularIngresoRollo({ toneladas: Number.NaN, precioTnMadera: Number.NaN, precioFleteTn: Number.NaN, ajustesAdicionalesFlete: Number.NaN });
    expect(Object.values(r).every(Number.isFinite)).toBe(true);
  });
});
