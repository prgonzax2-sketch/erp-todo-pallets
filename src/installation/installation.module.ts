import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Usuario } from '../auth/entities/usuario.entity.js';
import { AppInstallationState } from '../licensing/entities/app-installation-state.entity.js';
import { InstallationController } from './installation.controller.js';
import { InstallationService } from './installation.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario, AppInstallationState])],
  controllers: [InstallationController],
  providers: [InstallationService],
  exports: [InstallationService],
})
export class InstallationModule {}
