import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Fletero } from '../maestros-rollos/entities/fletero.entity.js';
import { MovimientoCcFletero } from './entities/movimiento-cc-fletero.entity.js';
import { CuentaCorrienteFleterosService } from './cuenta-corriente-fleteros.service.js';
import { CuentaCorrienteFleterosController } from './cuenta-corriente-fleteros.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([MovimientoCcFletero, Fletero]), AuthModule],
  controllers: [CuentaCorrienteFleterosController],
  providers: [CuentaCorrienteFleterosService],
  exports: [CuentaCorrienteFleterosService, TypeOrmModule],
})
export class CuentaCorrienteFleterosModule {}
