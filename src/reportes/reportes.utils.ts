import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types.js';

export type RptPeriodo = 'day' | 'week' | 'month' | 'year';

export interface RptRango {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  periodo: RptPeriodo;
  fechaRef: string;
  label: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

export function normalizarFechaRef(fecha?: string): string {
  const f = String(fecha || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
  return fmt(new Date());
}

/** Rango calendario (UTC-safe por fecha civil). week=ISO lun-dom; year=año calendario. */
export function calcularRangoReporte(periodo: string | undefined, fechaRef?: string): RptRango {
  const per: RptPeriodo = (['day', 'week', 'month', 'year'].includes(String(periodo)) ? periodo : 'day') as RptPeriodo;
  const ref = normalizarFechaRef(fechaRef);
  const [y, mo, d] = ref.split('-').map(Number);
  if (per === 'year') {
    return { periodo: per, fechaRef: ref, desde: `${y}-01-01`, hasta: `${y}-12-31`, label: `Año ${y}` };
  }
  if (per === 'month') {
    const desde = new Date(Date.UTC(y, mo - 1, 1));
    const hasta = new Date(Date.UTC(y, mo, 0));
    return { periodo: per, fechaRef: ref, desde: fmt(desde), hasta: fmt(hasta), label: `${y}-${pad2(mo)}` };
  }
  if (per === 'week') {
    const r = new Date(Date.UTC(y, mo - 1, d));
    const dow = r.getUTCDay();
    const off = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate() + off));
    const sun = new Date(Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + 6));
    return { periodo: per, fechaRef: ref, desde: fmt(mon), hasta: fmt(sun), label: `${fmt(mon)} a ${fmt(sun)} (sem)` };
  }
  return { periodo: 'day', fechaRef: ref, desde: ref, hasta: ref, label: ref };
}

export function validarAdmin(user: AuthenticatedUser) {
  if (user?.rol !== 'admin') {
    throw new ForbiddenException('Solo los administradores pueden acceder a reportes.');
  }
}

/** Scope efectivo: asignado => su planta (ignora/valida query); general => query.aserradero o null (global). */
export function resolveScopeAserradero(user: AuthenticatedUser, queryAserradero?: string | null): string | null {
  const own = String(user?.aserradero || '').trim();
  const q = String(queryAserradero || '').trim();
  if (own) return own; // asignado
  return q || null; // general: null = todas (cuando la vista lo soporte)
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Estándar Argentina/Excel regional: separador ';' + BOM + CRLF (ver toCsv)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvEscape).join(';')];
  for (const r of rows) lines.push(r.map(csvEscape).join(';'));
  return '\uFEFF' + lines.join('\r\n');
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
export function round3(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}
export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

