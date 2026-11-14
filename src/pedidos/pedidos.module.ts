import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PedidosController } from './pedidos.controller.js';
import { PedidosService } from './pedidos.service.js';
import { Pedido } from './entities/pedido.entity.js';
import { PedidoItem } from './entities/pedido-item.entity.js';
import { PedidoAsignacion } from './entities/pedido-asignacion.entity.js';
import { ProduccionEntity } from '../produccion/entities/produccion.entity.js';
import { Cliente } from '../clientes/entities/cliente.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pedido, PedidoItem, PedidoAsignacion, ProduccionEntity, Cliente]),
    AuthModule,
  ],
  controllers: [PedidosController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
