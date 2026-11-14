import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProduccionController } from './produccion.controller.js';
import { ProduccionService } from './produccion.service.js';
import { ProduccionEntity } from './entities/produccion.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { PendienteProduccion } from './entities/pendiente-produccion.entity.js';
import { PendientesProduccionController } from './pendientes-produccion.controller.js';
import { PendientesProduccionService } from './pendientes-produccion.service.js';

import { AprendizajePaquete } from './entities/aprendizaje-paquete.entity.js';
import { AprendizajePaquetesService } from './aprendizaje-paquetes.service.js';
import { PalletRecipe } from './entities/pallet-recipe.entity.js';
import { PalletProduccionDiaria } from './entities/pallet-produccion.entity.js';
import { MesaPallet } from './entities/mesa-pallet.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProduccionEntity, Aserradero, PendienteProduccion, AprendizajePaquete, PalletRecipe, PalletProduccionDiaria, MesaPallet, Empleado]),
    AuthModule
  ],
  controllers: [ProduccionController, PendientesProduccionController],
  providers: [ProduccionService, PendientesProduccionService, AprendizajePaquetesService],
  exports: [ProduccionService, PendientesProduccionService, AprendizajePaquetesService],
})
export class ProduccionModule {}
