import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { GeneralAdminGuard } from '../auth/guards/general-admin.guard.js';
import { AppLicensingState } from './entities/app-licensing-state.entity.js';
import { LicensingController } from './licensing.controller.js';
import { LicensingService } from './licensing.service.js';
import { MachineIdService } from './machine-id.service.js';
import { LicenseStateService } from './license-state.service.js';
import { LicenseValidationJob } from './license-validation.job.js';
import { LicenseGuard } from './license.guard.js';

@Module({
  imports: [
    PassportModule.register({}),
    AuthModule,
    TypeOrmModule.forFeature([AppLicensingState]),
  ],
  controllers: [LicensingController],
  providers: [
    LicensingService,
    MachineIdService,
    LicenseStateService,
    LicenseValidationJob,
    JwtAuthGuard,
    RolesGuard,
    GeneralAdminGuard,
    {
      provide: APP_GUARD,
      useClass: LicenseGuard,
    },
  ],
  exports: [LicensingService, LicenseStateService, MachineIdService],
})
export class LicensingModule {}
