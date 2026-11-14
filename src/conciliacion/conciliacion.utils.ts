export type GrupoEspecie = 'PINO' | 'EUCALIPTO' | 'MEZCLA' | 'OTRO';
export const GRUPOS_ESPECIE: GrupoEspecie[] = ['PINO', 'EUCALIPTO', 'MEZCLA', 'OTRO'];

export function normalizarEspecie(raw?: string | null): GrupoEspecie {
  const s = String(raw || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!s) return 'OTRO';
  if (s.includes('PINO') || s.includes('ELLIOT') || s.includes('TAEDA')) return 'PINO';
  if (s.includes('EUCA')) return 'EUCALIPTO';
  if (s.includes('MEZCL')) return 'MEZCLA';
  return 'OTRO';
}

export interface CoefEspecie {
  rendimientoMadera: number; // fracción del rollo que queda como madera útil
  coefAserrin: number;
  coefChip: number;
  factorTnConsumo: number; // m3 rollo -> TN
  m3UtilPorP2: number; // m3 madera útil por 1 P2 (configurable; depende convención P2/m³)
  factorTnAserrin?: number | null; // m³ aserrín -> TN (configurable; default inicial calibrable, override por aserradero+especie)
  factorTnChip?: number | null; // m³ chip -> TN (configurable; default inicial calibrable, override por aserradero+especie)
}
export type CoefOverride = Partial<CoefEspecie> | null | undefined;

// Defaults editables (punto de partida, calibrables por aserradero+especie). Ajustar con valores reales de planta.
// Promedios industria forestal (madera verde, orientativos): 1 m³ aserrado = 424 P² => m3UtilPorP2=1/424.
// Rendimiento madera (rollo→útil): Pino ~55%, Eucalipto ~40% (promedios).
// Residuo total del rollo (en este modelo: 1-rendimiento) repartido: ~45% aserrín, ~55% chip => coef_*_rollo = (1-rend)*0.45 / (1-rend)*0.55.
// Densidad verde orientativa: ~1 TN/m³ (factorTnConsumo/factorTnPlaya inicial).
// factorTnAserrin/Chip (m³ subproducto -> TN): DEFAULT INICIAL CALIBRABLE 0.30 t/m³ (orientativo; varía por humedad/densidad). Validar por planta vía override.
export const DEFAULTS_COEF: Record<GrupoEspecie, CoefEspecie> = {
  PINO: { rendimientoMadera: 0.55, coefAserrin: 0.2025, coefChip: 0.2475, factorTnConsumo: 1.0, m3UtilPorP2: 0.00236, factorTnAserrin: 0.30, factorTnChip: 0.30 },
  EUCALIPTO: { rendimientoMadera: 0.40, coefAserrin: 0.27, coefChip: 0.33, factorTnConsumo: 1.0, m3UtilPorP2: 0.00236, factorTnAserrin: 0.30, factorTnChip: 0.30 },
  MEZCLA: { rendimientoMadera: 0.475, coefAserrin: 0.23625, coefChip: 0.28875, factorTnConsumo: 1.0, m3UtilPorP2: 0.00236, factorTnAserrin: 0.30, factorTnChip: 0.30 },
  OTRO: { rendimientoMadera: 0.475, coefAserrin: 0.23625, coefChip: 0.28875, factorTnConsumo: 1.0, m3UtilPorP2: 0.00236, factorTnAserrin: 0.30, factorTnChip: 0.30 },
};

function pickNum(v: any, min: number, max: number): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}
export function mergeCoef(base: CoefEspecie, override?: CoefOverride): { coef: CoefEspecie; origen: 'default' | 'override' } {
  if (!override) return { coef: { ...base }, origen: 'default' };
  const merged: CoefEspecie = { ...base };
  let used = false;
  const r = pickNum(override.rendimientoMadera, 0.0001, 1); if (r !== undefined) { merged.rendimientoMadera = r; used = true; }
  const a = pickNum(override.coefAserrin, 0, 5); if (a !== undefined) { merged.coefAserrin = a; used = true; }
  const c = pickNum(override.coefChip, 0, 5); if (c !== undefined) { merged.coefChip = c; used = true; }
  const f = pickNum(override.factorTnConsumo, 0.0001, 5); if (f !== undefined) { merged.factorTnConsumo = f; used = true; }
  const m = pickNum(override.m3UtilPorP2, 0.000001, 1); if (m !== undefined) { merged.m3UtilPorP2 = m; used = true; }
  // factores TN subproducto: default inicial calibrable (0.30) aplicado automáticamente si no hay override válido.
  // null/undefined/inválido => heredar base (evita que filas override incompletas deshabiliten el default por planta).
  const fta = pickNum(override.factorTnAserrin, 0.000001, 20); if (fta !== undefined) { merged.factorTnAserrin = fta; used = true; }
  const ftc = pickNum(override.factorTnChip, 0.000001, 20); if (ftc !== undefined) { merged.factorTnChip = ftc; used = true; }
  return { coef: merged, origen: used ? 'override' : 'default' };
}

export function getCoef(grupo: GrupoEspecie, override?: CoefOverride): CoefEspecie {
  return mergeCoef(DEFAULTS_COEF[grupo] || DEFAULTS_COEF.OTRO, override).coef;
}
export function getCoefConOrigen(grupo: GrupoEspecie, override?: CoefOverride) {
  return mergeCoef(DEFAULTS_COEF[grupo] || DEFAULTS_COEF.OTRO, override);
}

export function round3(n: number) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

/** P2 aprox (fórmula sistema, asume dimensiones en mm; factor 424/1e9). */
export function calcP2(cantidadPaquetes: number, piezasPorPaquete: number, espesor: number, ancho: number, largo: number, unidadDimensiones?: string | null): number {
  let e = Number(espesor) || 0, a = Number(ancho) || 0, l = Number(largo) || 0;
  const u = String(unidadDimensiones || 'MM').toUpperCase();
  if (u === 'METROS') { e *= 1000; a *= 1000; l *= 1000; }
  else if (u === 'PULGADAS_MM' || u === 'PULGADAS') { e *= 25.4; a *= 25.4; /* largo ya mm en algunos casos; si viene en pies/pulg, aproximar */ }
  const cp = Math.max(0, Number(cantidadPaquetes) || 0);
  const pp = Math.max(0, Number(piezasPorPaquete) || 0);
  return Math.max(0, (cp * pp * e * a * l * 424) / 1000000000);
}

export function calcP2Component(paquetes: number, comp: any, unidadDimensiones?: string | null): number {
  if (!comp) return 0;
  const cant = Number(comp.cantidad) || 0; // por paquete
  const piezas = cant * Math.max(0, Number(paquetes) || 0);
  const m = comp.medida || comp;
  return calcP2(1, piezas, Number(m.espesor) || 0, Number(m.ancho) || 0, Number(m.largo) || 0, unidadDimensiones);
}
