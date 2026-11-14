import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { Proveedor } from '../proveedores/entities/proveedor.entity.js';
import { Rubro } from '../rubros/entities/rubro.entity.js';
import { GastoComprobante } from './entities/gasto-comprobante.entity.js';
import { GastoLinea } from './entities/gasto-linea.entity.js';
import { GastosController } from './gastos.controller.js';
import { GastosService } from './gastos.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([GastoComprobante, GastoLinea, Aserradero, Area, Proveedor, Rubro]),
    AuthModule,
  ],
  controllers: [GastosController],
  providers: [GastosService],
  exports: [GastosService, TypeOrmModule],
})
export class GastosModule {}
