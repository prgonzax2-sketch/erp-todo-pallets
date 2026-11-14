import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalidaStock } from './entities/salida-stock.entity.js';
import { SalidaStockDetalle } from './entities/salida-stock-detalle.entity.js';
import { SalidasStockService } from './salidas-stock.service.js';
import { SalidasStockController } from './salidas-stock.controller.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalidaStock, SalidaStockDetalle, ProduccionEntity, Cliente]),
    AuthModule,
  ],
  controllers: [SalidasStockController],
  providers: [SalidasStockService],
  exports: [SalidasStockService],
})
export class SalidasStockModule {}

