import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngresoRollo } from '../ingreso-rollos/entities/ingreso-rollo.entity.js';
import { ConteoPlayaRollo } from './entities/conteo-playa-rollo.entity.js';
import { ConteoPlayaRolloItem } from './entities/conteo-playa-rollo-item.entity.js';
import { ConteoPlayaRollosService } from './conteo-playa-rollos.service.js';
import { ConteoPlayaRollosController } from './conteo-playa-rollos.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ConteoPlayaRollo, ConteoPlayaRolloItem, IngresoRollo])],
  controllers: [ConteoPlayaRollosController],
  providers: [ConteoPlayaRollosService],
  exports: [ConteoPlayaRollosService],
})
export class ConteoPlayaRollosModule {}
