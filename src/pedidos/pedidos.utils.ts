export const TOLERANCIA_MM = 1; // D1: ±1 mm inclusive en las 3 dimensiones

export function normalizarTexto(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

export function dentroToleranciaMm(solicitado: number, real: number, tol = TOLERANCIA_MM): boolean {
  return Math.abs(Number(real || 0) - Number(solicitado || 0)) <= tol;
}

export function matchMedidaTolerante(
  sol: { espesor: number; ancho: number; largo: number },
  real: { espesor: number; ancho: number; largo: number },
  tol = TOLERANCIA_MM,
) {
  const dE = Math.abs(Number(real.espesor || 0) - Number(sol.espesor || 0));
  const dA = Math.abs(Number(real.ancho || 0) - Number(sol.ancho || 0));
  const dL = Math.abs(Number(real.largo || 0) - Number(sol.largo || 0));
  const match = dE <= tol && dA <= tol && dL <= tol;
  const difiere = dE > 0 || dA > 0 || dL > 0;
  return { match, difiere, dE, dA, dL, sumaDelta: dE + dA + dL };
}

export function matchEspecieOpcional(especieSolicitada: unknown, especieReal: unknown): boolean {
  const sol = normalizarTexto(especieSolicitada);
  if (!sol) return true;
  const real = normalizarTexto(especieReal);
  return real.includes(sol) || sol.includes(real);
}

export function ordenarCandidatosTolerantes<T extends { disponible?: number; id?: number; sumaDelta?: number; difiere?: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aExact = a.difiere ? 1 : 0;
    const bExact = b.difiere ? 1 : 0;
    if (aExact !== bExact) return aExact - bExact;
    const ds = Number(a.sumaDelta || 0) - Number(b.sumaDelta || 0);
    if (ds !== 0) return ds;
    const dd = Number(b.disponible || 0) - Number(a.disponible || 0);
    if (dd !== 0) return dd;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

export function calcularP2Base(tablas: number, espesor: number, ancho: number, largo: number): number {
  return (Number(tablas || 0) * Number(espesor || 0) * Number(ancho || 0) * Number(largo || 0) * 424) / 1000000000;
}

export function calcularP2Componentes(paquetes: number, componentes: any[] | undefined | null): number {
  return (componentes || []).reduce((sum: number, comp: any) => {
    const cant = Number(paquetes || 0) * Number(comp?.cantidad || 0);
    const med = comp?.medida || {};
    return sum + (cant * Number(med.espesor || 0) * Number(med.ancho || 0) * Number(med.largo || 0) * 424) / 1000000000;
  }, 0);
}

export function round3(n: number): number {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

export function calcularP2Asignacion(params: {
  paquetes: number;
  piezasPorPaquete: number;
  medidaSolicitada: { espesor: number; ancho: number; largo: number };
  medidaReal: { espesor: number; ancho: number; largo: number };
  separadores?: any[];
  tacos?: any[];
}) {
  const tablas = Number(params.paquetes || 0) * Number(params.piezasPorPaquete || 0);
  const p2BaseSol = calcularP2Base(tablas, params.medidaSolicitada.espesor, params.medidaSolicitada.ancho, params.medidaSolicitada.largo);
  const p2BaseReal = calcularP2Base(tablas, params.medidaReal.espesor, params.medidaReal.ancho, params.medidaReal.largo);
  const p2Sep = calcularP2Componentes(params.paquetes, params.separadores);
  const p2Taco = calcularP2Componentes(params.paquetes, params.tacos);
  const p2Solicitado = round3(p2BaseSol + p2Sep + p2Taco);
  const p2Real = round3(p2BaseReal + p2Sep + p2Taco);
  const kgEstimados = round3(p2Solicitado * 2.2);
  return { tablas, p2BaseSolicitado: round3(p2BaseSol), p2BaseReal: round3(p2BaseReal), p2Separadores: round3(p2Sep), p2Tacos: round3(p2Taco), p2Solicitado, p2Real, kgEstimados };
}
