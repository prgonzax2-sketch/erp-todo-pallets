import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Aserradero } from './entities/aserradero.entity.js';
import { AserraderosController } from './aserraderos.controller.js';
import { AserraderosService } from './aserraderos.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Aserradero]), AuthModule],
  controllers: [AserraderosController],
  providers: [AserraderosService],
  exports: [AserraderosService],
})
export class AserraderosModule {}
