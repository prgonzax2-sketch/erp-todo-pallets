import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InstallationService } from './installation.service.js';

@Controller('installation')
export class InstallationController {
  constructor(
    private readonly installationService: InstallationService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('setup-status')
  async setupStatus() {
    return this.installationService.getSetupStatus();
  }

  @Post('setup-admin')
  @HttpCode(200)
  async setupAdmin(@Body() body: { email?: string; password?: string; nombre?: string }) {
    return this.installationService.createInitialAdmin(body);
  }

  @Post('server-url')
  @HttpCode(200)
  async setServerUrl(
    @Body() body: { url?: string; remove?: boolean },
    @Headers('authorization') authorization?: string,
  ) {
    const status = await this.installationService.getSetupStatus();
    if (status.needsSetup) {
      return this.installationService.setServerPublicUrl(body, { allowWhenAdminExists: false });
    }

    // Post-setup: requiere administrador autenticado (edición controlada)
    const auth = String(authorization || '');
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException('Se requiere autenticación de administrador para modificar la URL del servidor.');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token) as any;
      const rol = String(payload?.rol || '');
      if (rol !== 'admin') {
        throw new ForbiddenException('Solo un administrador puede modificar la URL del servidor.');
      }
      return this.installationService.setServerPublicUrl(body, { allowWhenAdminExists: true });
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new UnauthorizedException('Sesión inválida o sin permisos para modificar la URL del servidor.');
    }
  }
}
