import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { MaestrosRollosModule } from '../maestros-rollos/maestros-rollos.module.js';
import { CuentaCorrienteFleterosModule } from '../cuenta-corriente-fleteros/cuenta-corriente-fleteros.module.js';
import { IngresoRollo } from './entities/ingreso-rollo.entity.js';
import { IngresoRollosService } from './ingreso-rollos.service.js';
import { IngresoRollosController } from './ingreso-rollos.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([IngresoRollo]),
    AuthModule,
    MaestrosRollosModule,
    CuentaCorrienteFleterosModule,
  ],
  controllers: [IngresoRollosController],
  providers: [IngresoRollosService],
  exports: [IngresoRollosService],
})
export class IngresoRollosModule {}
