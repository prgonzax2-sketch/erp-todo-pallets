import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { GeneralAdminGuard } from '../auth/guards/general-admin.guard.js';
import { LicensingModule } from '../licensing/licensing.module.js';
import { UpdatesController } from './updates.controller.js';
import { UpdateNotifierService } from './update-notifier.service.js';

@Module({
  imports: [PassportModule.register({}), AuthModule, LicensingModule],
  controllers: [UpdatesController],
  providers: [UpdateNotifierService, JwtAuthGuard, RolesGuard, GeneralAdminGuard],
  exports: [UpdateNotifierService],
})
export class UpdatesModule {}
