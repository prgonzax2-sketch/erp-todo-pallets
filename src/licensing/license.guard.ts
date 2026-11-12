import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicensingService } from './licensing.service.js';

export const SKIP_LICENSE_CHECK = 'skipLicenseCheck';

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly licensingService: LicensingService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LICENSE_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<{ method?: string; path?: string; url?: string; originalUrl?: string }>();
    const rawPath = (req.path || req.originalUrl || req.url || '').split('?')[0] || '';
    if (this.isWhitelisted(rawPath)) return true;

    const access = await this.licensingService.evaluateAccess();
    if (access.allowed) return true;

    throw new ForbiddenException({
      statusCode: 403,
      error: 'LICENSE_REQUIRED',
      message: access.reason || 'Licencia requerida',
      licenseStatus: access.state.licenseStatus ?? null,
    });
  }

  private isWhitelisted(path: string): boolean {
    // Recursos/health/auth/licensing/activación y estáticos necesarios
    if (path === '/' || path === '') return true;
    if (path === '/index.html' || path === '/styles.css' || path === '/favicon.ico') return true;
    if (path === '/activacion' || path.startsWith('/activacion/')) return true;
    if (path === '/health' || path.startsWith('/health/')) return true;
    if (path.startsWith('/licensing')) return true; // estado/activación/check (públicos y admin protegidos por sus guards)
    if (path.startsWith('/auth')) return true; // login/auth
    // estáticos servidos desde raíz si aplica
    if (path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.svg') || path.endsWith('.ico') || path.endsWith('.webp') || path.endsWith('.map')) return true;
    return false;
  }
}
