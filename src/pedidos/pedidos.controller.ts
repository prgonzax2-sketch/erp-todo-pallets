import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PedidosService } from './pedidos.service.js';
import { CrearAsignacionDto, CreatePedidoDto, EmitirDespachoDto, EmitirRemitoSubproductoDto } from './dto/pedido.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('pedidos')
@UseGuards(AuthGuard('jwt'))
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Post()
  crear(@Body() dto: CreatePedidoDto, @Req() req: { user: AuthenticatedUser }) {
    return this.pedidosService.crear(dto, req.user);
  }

  @Get()
  listar(@Query() query: any, @Req() req: { user: AuthenticatedUser }) {
    return this.pedidosService.listar(query, req.user);
  }

  @Get('stock/disponible')
  buscarStockDisponible(@Query() query: any, @Req() req: { user: AuthenticatedUser }) {
    return this.pedidosService.buscarStockDisponible(query, req.user);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.pedidosService.obtener(id, req.user);
  }

  @Post(':id/asignaciones')
  crearAsignacion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearAsignacionDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.pedidosService.crearAsignacion(id, dto, req.user);
  }

  @Delete(':id/asignaciones/:asignacionId')
  liberarAsignacion(
    @Param('id', ParseIntPipe) id: number,
    @Param('asignacionId', ParseIntPipe) asignacionId: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.pedidosService.liberarAsignacion(id, asignacionId, req.user);
  }

  @Post(':id/emitir-despacho')
  emitirDespacho(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmitirDespachoDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.pedidosService.emitirDespacho(id, dto, req.user);
  }

  @Post(':id/emitir-remito-subproducto')
  emitirRemitoSubproducto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmitirRemitoSubproductoDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.pedidosService.emitirRemitoSubproducto(id, dto, req.user);
  }
}
