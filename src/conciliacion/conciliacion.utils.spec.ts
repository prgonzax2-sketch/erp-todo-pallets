import { describe, expect, it } from 'vitest';
import { calcP2, calcP2Component, getCoef, getCoefConOrigen, mergeCoef, normalizarEspecie } from './conciliacion.utils.js';

describe('conciliacion.utils', () => {
  it('normaliza especies/grupos', () => {
    expect(normalizarEspecie('Pino elliotis')).toBe('PINO');
    expect(normalizarEspecie('EUCALIPTO GRANDIS')).toBe('EUCALIPTO');
    expect(normalizarEspecie('mezcla')).toBe('MEZCLA');
    expect(normalizarEspecie('')).toBe('OTRO');
    expect(normalizarEspecie(null)).toBe('OTRO');
  });

  it('calcula P2 (mm, factor 424/1e9)', () => {
    // 1 paq, 1 pieza, 25x100x3000 mm => 25*100*3000*424/1e9 = 3.18
    expect(calcP2(1, 1, 25, 100, 3000, 'MM')).toBeCloseTo(3.18, 3);
  });

  it('calcula P2 componente por cantidad/paq * paquetes', () => {
    const p2 = calcP2Component(2, { cantidad: 3, medida: { espesor: 25, ancho: 100, largo: 3000 } }, 'MM');
    expect(p2).toBeCloseTo(3.18 * 6, 3);
  });

  it('defaults por especie difieren (ponderación, promedios industria calibrables)', () => {
    const p = getCoef('PINO');
    const e = getCoef('EUCALIPTO');
    expect(p.rendimientoMadera).toBeCloseTo(0.55, 6);
    expect(e.rendimientoMadera).toBeCloseTo(0.40, 6);
    expect(p.coefAserrin).toBeCloseTo(0.2025, 6); // (1-0.55)*0.45
    expect(e.coefChip).toBeCloseTo(0.33, 6); // (1-0.40)*0.55
    expect(p.m3UtilPorP2).toBeCloseTo(0.00236, 8);
    expect(p.factorTnConsumo).toBeCloseTo(1.0, 6);
  });

  it('D2 mergeCoef aplica override válido y expone origen; sin override usa default', () => {
    const base = getCoef('PINO');
    const sin = mergeCoef(base, null);
    expect(sin.origen).toBe('default');
    expect(sin.coef.coefAserrin).toBeCloseTo(0.2025, 6);
    const ov = getCoefConOrigen('PINO', { coefAserrin: 0.12, rendimientoMadera: 0.55 });
    expect(ov.origen).toBe('override');
    expect(ov.coef.coefAserrin).toBe(0.12);
    expect(ov.coef.rendimientoMadera).toBe(0.55);
    expect(ov.coef.coefChip).toBe(base.coefChip); // no override => default
  });

  it('CA-5: factorTnAserrin/Chip con default inicial calibrable; override prevalece; ausencia de override usa default', () => {
    const base = getCoef('PINO');
    expect(base.factorTnAserrin).toBeCloseTo(0.30, 6);
    expect(base.factorTnChip).toBeCloseTo(0.30, 6);
    // sin override => hereda default (fallback automático)
    const sin = mergeCoef(base, null);
    expect(sin.origen).toBe('default');
    expect(sin.coef.factorTnAserrin).toBeCloseTo(0.30, 6);
    // override personalizado prevalece
    const ov = mergeCoef(base, { factorTnAserrin: 0.25, factorTnChip: 0.28 });
    expect(ov.coef.factorTnAserrin).toBe(0.25);
    expect(ov.coef.factorTnChip).toBe(0.28);
  });
});
