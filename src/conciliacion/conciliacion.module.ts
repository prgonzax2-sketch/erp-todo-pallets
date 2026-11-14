import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { IngresoRollo } from '../ingreso-rollos/entities/ingreso-rollo.entity.js';
import { ConteoPlayaRollo } from '../conteo-playa-rollos/entities/conteo-playa-rollo.entity.js';
import { SubproductoEgreso } from './entities/subproducto-egreso.entity.js';
import { ConciliacionCoefConfig } from './entities/conciliacion-coef-config.entity.js';
import { ConciliacionService } from './conciliacion.service.js';
import { ConciliacionController } from './conciliacion.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProduccionEntity, IngresoRollo, ConteoPlayaRollo, SubproductoEgreso, ConciliacionCoefConfig])],
  controllers: [ConciliacionController],
  providers: [ConciliacionService],
  exports: [ConciliacionService],
})
export class ConciliacionModule {}
