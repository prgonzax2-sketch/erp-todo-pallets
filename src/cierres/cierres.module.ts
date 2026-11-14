import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CierresController } from './cierres.controller.js';
import { CierresService } from './cierres.service.js';
import { CierreBovedaPago } from './entities/cierre-boveda-pago.entity.js';
import { CierreArchivo } from './entities/cierre-archivo.entity.js';
import { CierreHistorialLiquidacion } from './entities/cierre-historial-liquidacion.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([CierreBovedaPago, CierreArchivo, CierreHistorialLiquidacion]), AuthModule],
  controllers: [CierresController],
  providers: [CierresService],
  exports: [CierresService],
})
export class CierresModule {}
