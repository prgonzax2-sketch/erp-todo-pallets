import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Madera } from './entities/madera.entity.js';
import { ProveedorMadera } from './entities/proveedor-madera.entity.js';
import { Quinta } from './entities/quinta.entity.js';
import { Plantacion } from './entities/plantacion.entity.js';
import { Transporte } from './entities/transporte.entity.js';
import { Fletero } from './entities/fletero.entity.js';
import { MaderasService } from './maderas.service.js';
import { ProveedoresMaderaService } from './proveedores-madera.service.js';
import { QuintasService } from './quintas.service.js';
import { PlantacionesService } from './plantaciones.service.js';
import { TransportesService } from './transportes.service.js';
import { FleterosService } from './fleteros.service.js';
import { MaderasController } from './maderas.controller.js';
import { ProveedoresMaderaController } from './proveedores-madera.controller.js';
import { QuintasController } from './quintas.controller.js';
import { PlantacionesController } from './plantaciones.controller.js';
import { TransportesController } from './transportes.controller.js';
import { FleterosController } from './fleteros.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Madera, ProveedorMadera, Quinta, Plantacion, Transporte, Fletero]),
    AuthModule,
  ],
  controllers: [
    MaderasController,
    ProveedoresMaderaController,
    QuintasController,
    PlantacionesController,
    TransportesController,
    FleterosController,
  ],
  providers: [
    MaderasService,
    ProveedoresMaderaService,
    QuintasService,
    PlantacionesService,
    TransportesService,
    FleterosService,
  ],
  exports: [
    TypeOrmModule,
    MaderasService,
    ProveedoresMaderaService,
    QuintasService,
    PlantacionesService,
    TransportesService,
    FleterosService,
  ],
})
export class MaestrosRollosModule {}
