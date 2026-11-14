import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdelantosService } from './adelantos.service.js';
import { AdelantosController } from './adelantos.controller.js';
import { Adelanto } from './entities/adelanto.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Adelanto, Empleado]), AuthModule],
  controllers: [AdelantosController],
  providers: [AdelantosService],
})
export class AdelantosModule {}