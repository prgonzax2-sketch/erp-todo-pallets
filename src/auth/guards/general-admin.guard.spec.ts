import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth.types.js';
import { GeneralAdminGuard } from './general-admin.guard.js';

describe('GeneralAdminGuard', () => {
  const guard = new GeneralAdminGuard();
  const contextFor = (user: Partial<AuthenticatedUser>) => ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

  it('permite a un administrador general', () => {
    expect(guard.canActivate(contextFor({ rol: 'admin', aserradero: null }))).toBe(true);
  });

  it('rechaza empleados y administradores asignados a una planta', () => {
    expect(() => guard.canActivate(contextFor({ rol: 'empleado' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor({ rol: 'admin', aserradero: 'Planta Norte' }))).toThrow(ForbiddenException);
  });
});
