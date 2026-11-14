export const IVA_ALICUOTAS = [0, 10.5, 21, 27] as const;
export type IvaAlicuota = (typeof IVA_ALICUOTAS)[number];

export const ESTADOS_GASTO = ['BORRADOR', 'CONFIRMADO', 'ANULADO'] as const;
export type EstadoGasto = (typeof ESTADOS_GASTO)[number];

export const TIPOS_COMPROBANTE = [
  'FACTURA_A',
  'FACTURA_B',
  'FACTURA_C',
  'FACTURA_X',
  'ORDEN',
  'ACUSE',
  'RECIBO',
  'X',
] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];

/** Tipos internos sin nº fiscal obligatorio: si se omite número, autogenerar [TIPO]-[ID_BD]. */
export const TIPOS_INTERNOS = ['X', 'ACUSE', 'RECIBO', 'ORDEN'] as const;

export function esTipoInterno(tipo?: string | null): boolean {
  return !!tipo && (TIPOS_INTERNOS as readonly string[]).includes(String(tipo).trim().toUpperCase());
}

export function round2(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

export interface GastoLineaCalculoInput {
  cantidad?: unknown;
  precioUnitario?: unknown;
}

export function calcularNetoLinea(input: GastoLineaCalculoInput): number {
  const cantidad = Math.max(0, Number(input.cantidad) || 0);
  const precio = Math.max(0, Number(input.precioUnitario) || 0);
  return round2(cantidad * precio);
}

export interface GastoCabeceraCalculoInput {
  lineas?: GastoLineaCalculoInput[];
  ivaAlicuota?: unknown;
  ivaExento?: boolean | null | undefined;
  otrosTributos?: unknown;
}

export interface GastoCabeceraCalculoResult {
  subtotalNeto: number;
  ivaMonto: number;
  otrosTributos: number;
  total: number;
}

export function calcularCabecera(input: GastoCabeceraCalculoInput): GastoCabeceraCalculoResult {
  const lineas = Array.isArray(input.lineas) ? input.lineas : [];
  const subtotalNeto = round2(lineas.reduce((acc, l) => acc + calcularNetoLinea(l), 0));
  const otrosTributos = round2(Math.max(0, Number(input.otrosTributos) || 0));
  const ivaAlicuota = Number(input.ivaAlicuota);
  const alicuotaValida = Number.isFinite(ivaAlicuota) ? ivaAlicuota : 0;
  const ivaMonto = input.ivaExento ? 0 : round2(subtotalNeto * (alicuotaValida / 100));
  const total = round2(subtotalNeto + ivaMonto + otrosTributos);
  return { subtotalNeto, ivaMonto, otrosTributos, total };
}

export function derivarMesAnio(fecha: unknown): { mes: number | null; anio: number | null } {
  const f = String(fecha || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  if (!m) return { mes: null, anio: null };
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    return { mes: null, anio: null };
  }
  return { mes, anio };
}

/** Genera número interno autogenerado: [TIPO]-[ID_BD]. */
export function generarNumeroInterno(tipo: string, id: number): string {
  const t = String(tipo || '').trim().toUpperCase() || 'INT';
  return `${t}-${id}`;
}
