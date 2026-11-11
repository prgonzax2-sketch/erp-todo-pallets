import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { GeneralAdminGuard } from '../auth/guards/general-admin.guard.js';
import { LicensingService } from './licensing.service.js';

@Controller('licensing')
@UseGuards(JwtAuthGuard, RolesGuard, GeneralAdminGuard)
@Roles('admin')
export class LicensingController {
  constructor(private readonly licensingService: LicensingService) {}

  @Get('status')
  async status() {
    return this.licensingService.getStatusView();
  }

  @Post('check-now')
  async checkNow() {
    const result = await this.licensingService.verifyNow('manual');
    const view = await this.licensingService.getStatusView();
    return { ok: result.ok, message: result.message, status: view };
  }

  @Post('activate')
  async activate() {
    // Activación inicial/renovación: dispara verificación online (D2 MVP online)
    const result = await this.licensingService.verifyNow('manual');
    const view = await this.licensingService.getStatusView();
    return { ok: result.ok, message: result.message, status: view };
  }
}
