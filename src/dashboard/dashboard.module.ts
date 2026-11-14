import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { IngresoRollo } from '../ingreso-rollos/entities/ingreso-rollo.entity.js';
import { Adelanto } from '../adelantos/entities/adelanto.entity.js';
import { Liquidacion } from '../liquidaciones/entities/liquidacion.entity.js';
import { ConciliacionCoefConfig } from '../conciliacion/entities/conciliacion-coef-config.entity.js';
import { GastoComprobante } from '../gastos/entities/gasto-comprobante.entity.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProduccionEntity,
      IngresoRollo,
      Adelanto,
      Liquidacion,
      ConciliacionCoefConfig,
      GastoComprobante,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
