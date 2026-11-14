import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { TurnoBorrador } from './entities/turno-borrador.entity.js';
import { Adelanto } from '../adelantos/entities/adelanto.entity.js';
import { TurnosController } from './turnos.controller.js';
import { TurnosService } from './turnos.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Empleado, TurnoBorrador, Adelanto]), AuthModule],
  controllers: [TurnosController],
  providers: [TurnosService],
})
export class TurnosModule {}