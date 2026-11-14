import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { BackupsController } from './backups.controller.js';
import { BackupsService } from './backups.service.js';
import { BackupConfig } from './entities/backup-config.entity.js';
import { BackupRun } from './entities/backup-run.entity.js';

@Module({
  imports: [PassportModule.register({}), AuthModule, TypeOrmModule.forFeature([BackupConfig, BackupRun])],
  controllers: [BackupsController],
  providers: [BackupsService, JwtAuthGuard, RolesGuard],
})
export class BackupsModule {}