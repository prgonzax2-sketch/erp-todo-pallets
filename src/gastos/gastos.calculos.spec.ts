import { describe, expect, it } from 'vitest';
import {
  calcularCabecera,
  calcularNetoLinea,
  derivarMesAnio,
  esTipoInterno,
  generarNumeroInterno,
  round2,
} from './gastos.calculos.js';

describe('gastos.calculos', () => {
  it('round2 redondea a 2 decimales de forma segura', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(undefined)).toBe(0);
  });

  it('calcula neto de línea = cantidad * precio unitario', () => {
    expect(calcularNetoLinea({ cantidad: 2, precioUnitario: 1500.5 })).toBe(3001);
    expect(calcularNetoLinea({ cantidad: 0, precioUnitario: 100 })).toBe(0);
    expect(calcularNetoLinea({ cantidad: -1, precioUnitario: 100 })).toBe(0);
  });

  it('calcula cabecera: subtotal, IVA por alícuota, otros tributos y total', () => {
    const r = calcularCabecera({
      lineas: [
        { cantidad: 2, precioUnitario: 1000 },
        { cantidad: 1, precioUnitario: 500.5 },
      ],
      ivaAlicuota: 21,
      ivaExento: false,
      otrosTributos: 100,
    });
    expect(r.subtotalNeto).toBe(2500.5);
    expect(r.ivaMonto).toBe(525.11); // 2500.5 * 0.21 = 525.105
    expect(r.otrosTributos).toBe(100);
    expect(r.total).toBe(3125.61);
  });

  it('IVA exento => iva_monto 0 aunque la alícuota sea 0 u otra', () => {
    const r = calcularCabecera({
      lineas: [{ cantidad: 1, precioUnitario: 1000 }],
      ivaAlicuota: 0,
      ivaExento: true,
      otrosTributos: 0,
    });
    expect(r.subtotalNeto).toBe(1000);
    expect(r.ivaMonto).toBe(0);
    expect(r.total).toBe(1000);
  });

  it('alícuota 0 no exento => IVA 0; alícuota 10.5 calculada', () => {
    const cero = calcularCabecera({
      lineas: [{ cantidad: 1, precioUnitario: 200 }],
      ivaAlicuota: 0,
      ivaExento: false,
    });
    expect(cero.ivaMonto).toBe(0);
    expect(cero.total).toBe(200);

    const diez = calcularCabecera({
      lineas: [{ cantidad: 1, precioUnitario: 1000 }],
      ivaAlicuota: 10.5,
      ivaExento: false,
    });
    expect(diez.ivaMonto).toBe(105);
    expect(diez.total).toBe(1105);
  });

  it('deriva mes/año desde fecha YYYY-MM-DD', () => {
    expect(derivarMesAnio('2026-11-08')).toEqual({ mes: 11, anio: 2026 });
    expect(derivarMesAnio('2026-11-08T12:00:00Z')).toEqual({ mes: 11, anio: 2026 });
    expect(derivarMesAnio('invalida')).toEqual({ mes: null, anio: null });
    expect(derivarMesAnio(null)).toEqual({ mes: null, anio: null });
  });

  it('identifica tipos internos y genera número [TIPO]-[ID_BD]', () => {
    expect(esTipoInterno('X')).toBe(true);
    expect(esTipoInterno('ORDEN')).toBe(true);
    expect(esTipoInterno('ACUSE')).toBe(true);
    expect(esTipoInterno('RECIBO')).toBe(true);
    expect(esTipoInterno('FACTURA_A')).toBe(false);
    expect(esTipoInterno('FACTURA_X')).toBe(false);
    expect(generarNumeroInterno('ORDEN', 42)).toBe('ORDEN-42');
  });
});
