import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { GeneralAdminGuard } from '../auth/guards/general-admin.guard.js';
import { LicensingService } from './licensing.service.js';
import { ActivateLicenseTokenDto } from './dto/activate-license-token.dto.js';

@Controller('licensing')
export class LicensingController {
  constructor(private readonly licensingService: LicensingService) {}

  // --- Endpoints públicos de activación (sin sesión admin, usados por /activacion) ---

  @Get('activation-status')
  async activationStatus() {
    return this.licensingService.getActivationStatusView();
  }

  @Post('activate-token')
  @HttpCode(200)
  async activateToken(@Body() dto: ActivateLicenseTokenDto) {
    return this.licensingService.activateWithToken(dto.licenseToken);
  }

  // --- Endpoints admin (estado/diagnóstico/acciones sensibles) ---

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard, GeneralAdminGuard)
  @Roles('admin')
  async status() {
    return this.licensingService.getStatusView();
  }

  @Post('check-now')
  @UseGuards(JwtAuthGuard, RolesGuard, GeneralAdminGuard)
  @Roles('admin')
  async checkNow() {
    const result = await this.licensingService.verifyNow('manual');
    const view = await this.licensingService.getStatusView();
    return { ok: result.ok, message: result.message, status: view };
  }

  @Post('activate')
  @UseGuards(JwtAuthGuard, RolesGuard, GeneralAdminGuard)
  @Roles('admin')
  async activate() {
    // Activación/verificación online (D2 MVP online) - conservado por compatibilidad
    const result = await this.licensingService.verifyNow('manual');
    const view = await this.licensingService.getStatusView();
    return { ok: result.ok, message: result.message, status: view };
  }
}
