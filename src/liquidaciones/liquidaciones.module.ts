import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiquidacionesService } from './liquidaciones.service.js';
import { LiquidacionesController } from './liquidaciones.controller.js';
import { Liquidacion } from './entities/liquidacion.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { ParteDiario } from '../partes-diarios/entities/parte-diario.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  // ¡Aquí le damos acceso a las 3 tablas vitales!
  imports: [TypeOrmModule.forFeature([Liquidacion, Empleado, ParteDiario]), AuthModule],
  controllers: [LiquidacionesController],
  providers: [LiquidacionesService],
})
export class LiquidacionesModule {}
