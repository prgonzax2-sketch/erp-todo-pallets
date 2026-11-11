import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { GeneralAdminGuard } from '../auth/guards/general-admin.guard.js';
import { UpdateNotifierService } from './update-notifier.service.js';

@Controller('updates')
@UseGuards(JwtAuthGuard, RolesGuard, GeneralAdminGuard)
@Roles('admin')
export class UpdatesController {
  constructor(private readonly notifier: UpdateNotifierService) {}

  @Get('status')
  async status() {
    return this.notifier.getStatus();
  }

  @Post('check-now')
  async checkNow() {
    const result = await this.notifier.checkForUpdate();
    const status = await this.notifier.getStatus();
    return { ...result, status };
  }
}
