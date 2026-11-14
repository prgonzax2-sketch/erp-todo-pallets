import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { Area } from './entities/area.entity.js';
import { AreasController } from './areas.controller.js';
import { AreasService } from './areas.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Area, Aserradero]), AuthModule],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService, TypeOrmModule],
})
export class AreasModule {}
