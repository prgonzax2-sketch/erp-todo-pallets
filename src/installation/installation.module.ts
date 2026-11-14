import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Usuario } from '../auth/entities/usuario.entity.js';
import { AppInstallationState } from '../licensing/entities/app-installation-state.entity.js';
import { InstallationController } from './installation.controller.js';
import { InstallationService } from './installation.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, AppInstallationState]),
    JwtModule.registerAsync({
      useFactory: () => {
        const jwtSecret = (process.env.JWT_SECRET || '').trim();
        if (!jwtSecret) {
          throw new Error('JWT_SECRET no configurado. Configure la variable de entorno antes de iniciar la aplicación.');
        }
        return {
          secret: jwtSecret,
          signOptions: { expiresIn: '8h' },
        };
      },
    }),
  ],
  controllers: [InstallationController],
  providers: [InstallationService],
  exports: [InstallationService],
})
export class InstallationModule {}
