import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { GeneralAdminGuard } from '../auth/guards/general-admin.guard.js';
import { UpdateBackupConfigDto } from './dto/update-backup-config.dto.js';
import { BackupsService } from './backups.service.js';

@Controller('backups')
@UseGuards(JwtAuthGuard, RolesGuard, GeneralAdminGuard)
@Roles('admin')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get('config')
  getConfig() {
    return this.backupsService.getConfig();
  }

  @Patch('config')
  updateConfig(@Body() body: UpdateBackupConfigDto) {
    return this.backupsService.updateConfig(body);
  }

  @Get('runs')
  listRuns() {
    return this.backupsService.listRuns();
  }

  @Post('run')
  runNow() {
    return this.backupsService.runNow();
  }
}