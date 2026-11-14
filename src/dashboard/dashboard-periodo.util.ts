import { BadRequestException } from '@nestjs/common';

export type DashboardPeriodo = 'day' | 'week' | 'month';

export type DashboardScope = 'global' | 'general_filtrado' | 'asignado';

export interface DashboardRango {
  periodo: DashboardPeriodo;
  fechaRef: string; // YYYY-MM-DD
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function parseYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').slice(0, 10));
  if (!m) throw new BadRequestException(`Fecha inválida (esperado YYYY-MM-DD): ${ymd}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo, d));
  // Validar que no haya overflow (ej. 2026-02-31)
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo || date.getUTCDate() !== d) {
    throw new BadRequestException(`Fecha inválida: ${ymd}`);
  }
  return date;
}

export function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Calcula rango [desde,hasta] (YYYY-MM-DD) para el período.
 * v1: semana lunes-domingo que contiene fechaRef (convención operativa explícita).
 * Cálculo en UTC sobre la fecha calendario para evitar desplazamientos por TZ local.
 */
export function calcularRangoPeriodo(periodo: DashboardPeriodo, fechaRef: string): DashboardRango {
  const ref = parseYmd(fechaRef);

  if (periodo === 'day') {
    const ymd = formatYmd(ref);
    return { periodo, fechaRef: ymd, desde: ymd, hasta: ymd };
  }

  if (periodo === 'month') {
    const y = ref.getUTCFullYear();
    const m = ref.getUTCMonth();
    const desde = formatYmd(new Date(Date.UTC(y, m, 1)));
    const hasta = formatYmd(new Date(Date.UTC(y, m + 1, 0)));
    return { periodo, fechaRef: formatYmd(ref), desde, hasta };
  }

  // week: lunes-domingo
  const dow = ref.getUTCDay(); // 0=domingo
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + offsetToMonday));
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
  return {
    periodo,
    fechaRef: formatYmd(ref),
    desde: formatYmd(monday),
    hasta: formatYmd(sunday),
  };
}
