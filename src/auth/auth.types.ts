export type AuthenticatedUser = {
  sub: number;
  email: string;
  rol: string;
  empleadoId?: number;
  aserradero?: string | null;
};