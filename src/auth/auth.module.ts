import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { Usuario } from './entities/usuario.entity.js';
import { JwtStrategy } from './jwt.strategy.js';
import { RolesGuard } from './guards/roles.guard.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { GeneralAdminGuard } from './guards/general-admin.guard.js';

@Module({
  imports: [
    PassportModule.register({}),
    TypeOrmModule.forFeature([Usuario, Aserradero, Empleado]),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET no está configurado. Defina la variable de entorno para iniciar la aplicación.');
        }
        return {
          secret,
          signOptions: { expiresIn: '1d' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, GeneralAdminGuard],
  exports: [RolesGuard, GeneralAdminGuard],
})
export class AuthModule {}