/**
 * Cálculos financieros Ventas/Despacho (BE fuente de verdad). UI solo previsualiza.
 * Monetario round2, P2/TN round3. Sin inventar valores operativos.
 */
export type UnidadPrecio = 'P2' | 'TN' | 'M2' | 'UNIDAD';

export const IVA_DEFAULT = 21;

export function round2(n: unknown): number {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}
export function round3(n: unknown): number {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 1000) / 1000;
}
export function toFinite(n: unknown, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export function resolverAlicuotaIva(linea?: unknown, cliente?: unknown, fallback = IVA_DEFAULT): number {
  const fromLinea = toFinite(linea, NaN);
  if (Number.isFinite(fromLinea) && fromLinea >= 0) return round2(fromLinea);
  const fromCliente = toFinite(cliente, NaN);
  if (Number.isFinite(fromCliente) && fromCliente >= 0) return round2(fromCliente);
  return round2(fallback);
}

/** Base de importe según unidad de precio. TN usa tnConfirmadas ?? tnProvisionales ?? toneladas. */
export function calcularCantidadBase(params: {
  unidadPrecio: UnidadPrecio | string;
  p2?: unknown;
  m2?: unknown;
  toneladas?: unknown;
  tnProvisionales?: unknown;
  tnReales?: unknown;
  cantidad?: unknown;
}): number {
  const up = String(params.unidadPrecio || 'P2').toUpperCase();
  if (up === 'TN') {
    const tn = params.tnReales ?? params.tnProvisionales ?? params.toneladas;
    return round3(Math.max(0, toFinite(tn, 0)));
  }
  if (up === 'M2') return round3(Math.max(0, toFinite(params.m2, 0)));
  if (up === 'UNIDAD') return round3(Math.max(0, toFinite(params.cantidad, 0)));
  // P2 default
  return round3(Math.max(0, toFinite(params.p2, 0)));
}

export function calcularLineaFinanciera(params: {
  unidadPrecio: UnidadPrecio | string;
  precioUnitario: unknown;
  alicuotaIva: unknown;
  p2?: unknown;
  m2?: unknown;
  toneladas?: unknown;
  tnProvisionales?: unknown;
  tnReales?: unknown;
  cantidad?: unknown;
}) {
  const precioUnitario = round2(Math.max(0, toFinite(params.precioUnitario, 0)));
  const alicuotaIva = round2(Math.max(0, toFinite(params.alicuotaIva, IVA_DEFAULT)));
  const cantidadBase = calcularCantidadBase(params);
  const importeNeto = round2(cantidadBase * precioUnitario);
  const ivaMonto = round2(importeNeto * (alicuotaIva / 100));
  const total = round2(importeNeto + ivaMonto);
  return { cantidadBase, precioUnitario, alicuotaIva, importeNeto, ivaMonto, total };
}

export function sumarTotales<T extends { importeNeto?: unknown; ivaMonto?: unknown; total?: unknown; p2?: unknown; toneladas?: unknown; cantidad?: unknown; m2?: unknown }>(
  lineas: T[],
) {
  let subtotalNeto = 0, ivaMonto = 0, total = 0, p2Total = 0, tnTotal = 0, cantTotal = 0, m2Total = 0;
  for (const l of lineas || []) {
    subtotalNeto = round2(subtotalNeto + toFinite(l.importeNeto, 0));
    ivaMonto = round2(ivaMonto + toFinite(l.ivaMonto, 0));
    total = round2(total + toFinite(l.total, 0));
    p2Total = round3(p2Total + toFinite(l.p2, 0));
    tnTotal = round3(tnTotal + toFinite((l as any).tnReales ?? (l as any).tnProvisionales ?? l.toneladas, 0));
    cantTotal = round3(cantTotal + toFinite(l.cantidad, 0));
    m2Total = round3(m2Total + toFinite(l.m2, 0));
  }
  return { subtotalNeto, ivaMonto, total, p2Total, tnTotal, cantTotal, m2Total };
}

export function estadoFacturacionDesde(facturaNumero?: unknown, tipoComprobante?: unknown): string {
  const f = String(facturaNumero ?? '').trim();
  const t = String(tipoComprobante ?? '').trim().toUpperCase();
  if (f) return 'FACTURADO';
  if (t && t !== 'REMITO' && t !== 'REMITO_X' && t !== 'X' && t !== 'SIN_COMPROBANTE') return 'FACTURADO_PARCIAL';
  return 'SIN_FACTURA';
}

export function p2DesdeDims(
  paquetes: unknown,
  piezasPorPaquete: unknown,
  espesor: unknown,
  ancho: unknown,
  largo: unknown,
  unidadDimensiones: unknown,
): number {
  const unidad = String(unidadDimensiones || 'MM').toUpperCase();
  const factor = unidad === 'MM' || unidad === 'MILIMETROS' ? 1 : unidad === 'CM' || unidad === 'CENTIMETROS' ? 10 : unidad === 'IN' || unidad === 'PULGADAS' ? 25.4 : 1;
  const e = toFinite(espesor) * factor;
  const a = toFinite(ancho) * factor;
  const l = toFinite(largo) * factor;
  const piezas = Math.max(0, toFinite(paquetes)) * Math.max(0, toFinite(piezasPorPaquete));
  return round3((piezas * e * a * l * 424) / 1_000_000_000);
}