import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Rubro } from './entities/rubro.entity.js';
import { RubrosController } from './rubros.controller.js';
import { RubrosService } from './rubros.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Rubro]), AuthModule],
  controllers: [RubrosController],
  providers: [RubrosService],
  exports: [RubrosService, TypeOrmModule],
})
export class RubrosModule {}
