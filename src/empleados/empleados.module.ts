import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpleadosService } from './empleados.service.js';
import { EmpleadosController } from './empleados.controller.js';
import { Empleado } from './entities/empleado.entity.js';
import { SueldoMensual } from './entities/sueldo-mensual.entity.js';
import { Usuario } from '../auth/entities/usuario.entity.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  // Aquí le decimos al módulo que use nuestra entidad (el plano)
  imports: [TypeOrmModule.forFeature([Empleado, SueldoMensual, Usuario, Aserradero]), AuthModule],
  controllers: [EmpleadosController],
  providers: [EmpleadosService],
})
export class EmpleadosModule {}
