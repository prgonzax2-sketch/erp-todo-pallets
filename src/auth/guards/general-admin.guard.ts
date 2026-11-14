import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth.types.js';

@Injectable()
export class GeneralAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.rol !== 'admin' || request.user.aserradero) {
      throw new ForbiddenException('Solo el administrador general puede realizar esta operación.');
    }
    return true;
  }
}
