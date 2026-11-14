const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Normaliza CUIT a 11 dígitos (quita guiones/espacios). Retorna null si vacío. */
export function normalizeCuit(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  return digits;
}

/** Valida CUIT argentino (11 dígitos + dígito verificador). Acepta con o sin guiones. */
export function isValidCuit(value?: string | null): boolean {
  const digits = normalizeCuit(value);
  if (digits === null) return true; // opcional
  if (digits.length !== 11) return false;
  if (!/^\d{11}$/.test(digits)) return false;
  const nums = digits.split('').map(Number);
  const sum = CUIT_WEIGHTS.reduce((acc, w, i) => acc + w * nums[i], 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false; // CUIT inválido (no reasignable en práctica)
  return check === nums[10];
}

/** Formatea 11 dígitos como XX-XXXXXXXX-X. Asume ya normalizado/válido en longitud. */
export function formatCuit(digits: string): string {
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}
