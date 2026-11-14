import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartesDiariosService } from './partes-diarios.service.js';
import { PartesDiariosController } from './partes-diarios.controller.js';
import { ParteDiario } from './entities/parte-diario.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  // Le damos acceso a las tablas ParteDiario y Empleado
  imports: [TypeOrmModule.forFeature([ParteDiario, Empleado]), AuthModule],
  controllers: [PartesDiariosController],
  providers: [PartesDiariosService],
})
export class PartesDiariosModule {}