export const IVA_RATE = 0.21;

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface IngresoRolloCalculoInput {
  toneladas?: number | null;
  precioTnMadera?: number | null;
  precioFleteTn?: number | null;
  ajustesAdicionalesFlete?: number | null;
  ivaRate?: number | null;
}

export interface IngresoRolloCalculoResult {
  subtotalBruto: number;
  iva: number;
  totalMadera: number;
  subtotalFlete: number;
  totalFleteViaje: number;
}

export function calcularIngresoRollo(input: IngresoRolloCalculoInput): IngresoRolloCalculoResult {
  const tn = Math.max(0, Number(input.toneladas) || 0);
  const precioTnMadera = Math.max(0, Number(input.precioTnMadera) || 0);
  const precioFleteTn = Math.max(0, Number(input.precioFleteTn) || 0);
  const ajustes = Number(input.ajustesAdicionalesFlete) || 0;
  const ivaRate = Number.isFinite(Number(input.ivaRate)) ? Number(input.ivaRate) : IVA_RATE;

  const subtotalBruto = round2(tn * precioTnMadera);
  const iva = round2(subtotalBruto * ivaRate);
  const totalMadera = round2(subtotalBruto + iva);
  const subtotalFlete = round2(tn * precioFleteTn);
  const totalFleteViaje = round2(subtotalFlete + ajustes);

  return { subtotalBruto, iva, totalMadera, subtotalFlete, totalFleteViaje };
}
