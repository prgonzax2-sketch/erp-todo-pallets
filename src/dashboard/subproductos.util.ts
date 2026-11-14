export type SubproductoCategoria = 'ASERRIN' | 'CHIP';

export const SUBPRODUCTOS_CLASIFICACION = 'heuristica_tipoProducto_v1' as const;

export const SUBPRODUCTOS_NOTA =
  'Clasificación heurística por tipoProducto/descripcionProducto; pendiente categoría formal.';

export interface SubproductoStats {
  registros: number;
  paquetes: number;
  piezas: number;
}

export interface SubproductosResult {
  aserrin: SubproductoStats;
  chip: SubproductoStats;
  clasificacion: typeof SUBPRODUCTOS_CLASIFICACION;
  nota: string;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Clasifica una fila de producción como subproducto.
 * v1 (heurística, configurable): usa tipoProducto con fallback a descripcionProducto.
 * Aliases: ASERRIN/SERRIN (+ VIRUTA FINA opcional) -> ASERRIN; CHIP/ASTILLA -> CHIP.
 * Sin coincidencia -> null (no se fabrica categoría).
 */
export function clasificarSubproducto(tipoProducto: unknown, descripcionProducto?: unknown): SubproductoCategoria | null {
  const fuente = normalizeText(tipoProducto) || normalizeText(descripcionProducto);
  if (!fuente) return null;
  // CHIP primero: "CHIP", "ASTILLA", "CHIPS"
  if (/\bCHIPS?\b|\bASTILLA\b/.test(fuente)) return 'CHIP';
  // ASERRIN: aserrin/serrin; "VIRUTA FINA" opcional (viruta sola es ambigua)
  if (/\bASERRIN\b|\bSERRIN\b|\bVIRUTA\s+FINA\b/.test(fuente)) return 'ASERRIN';
  return null;
}

export function emptySubproductoStats(): SubproductoStats {
  return { registros: 0, paquetes: 0, piezas: 0 };
}

export function emptySubproductosResult(): SubproductosResult {
  return {
    aserrin: emptySubproductoStats(),
    chip: emptySubproductoStats(),
    clasificacion: SUBPRODUCTOS_CLASIFICACION,
    nota: SUBPRODUCTOS_NOTA,
  };
}

export interface ProduccionFilaSubproducto {
  tipoProducto?: unknown;
  descripcionProducto?: unknown;
  cantidadPaquetes?: unknown;
  piezasPorPaquete?: unknown;
}

export function agregarSubproductos(filas: ProduccionFilaSubproducto[]): SubproductosResult {
  const result = emptySubproductosResult();
  for (const fila of filas || []) {
    const cat = clasificarSubproducto(fila.tipoProducto, fila.descripcionProducto);
    if (!cat) continue;
    const target = cat === 'ASERRIN' ? result.aserrin : result.chip;
    const paquetes = Number(fila.cantidadPaquetes) || 0;
    const piezasPorPaquete = Number(fila.piezasPorPaquete) || 0;
    target.registros += 1;
    target.paquetes += paquetes;
    target.piezas += paquetes * piezasPorPaquete;
  }
  // redondeo defensivo para floats
  result.aserrin.paquetes = round2(result.aserrin.paquetes);
  result.aserrin.piezas = round2(result.aserrin.piezas);
  result.chip.paquetes = round2(result.chip.paquetes);
  result.chip.piezas = round2(result.chip.piezas);
  return result;
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
