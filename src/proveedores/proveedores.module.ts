import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Rubro } from '../rubros/entities/rubro.entity.js';
import { Proveedor } from './entities/proveedor.entity.js';
import { ProveedoresController } from './proveedores.controller.js';
import { ProveedoresService } from './proveedores.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Proveedor, Rubro]), AuthModule],
  controllers: [ProveedoresController],
  providers: [ProveedoresService],
  exports: [ProveedoresService, TypeOrmModule],
})
export class ProveedoresModule {}
