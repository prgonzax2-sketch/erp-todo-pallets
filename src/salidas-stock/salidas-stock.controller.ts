import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalidasStockService } from './salidas-stock.service.js';
import { CreateSalidaStockDto, ConfirmarBasculaDto } from './dto/salida-stock.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('salidas-stock')
@UseGuards(AuthGuard('jwt'))
export class SalidasStockController {
  constructor(private readonly salidasStockService: SalidasStockService) {}

  @Post()
  registrarSalida(@Body() dto: CreateSalidaStockDto, @Req() request: { user: AuthenticatedUser }) {
    return this.salidasStockService.registrarSalida(dto, request.user);
  }

  @Get()
  listarSalidas(@Query() query: any, @Req() request: { user: AuthenticatedUser }) {
    return this.salidasStockService.listarSalidas(query, request.user);
  }

  @Get(':id')
  obtenerSalida(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.salidasStockService.obtenerSalida(id, request.user);
  }

  @Patch(':id/anular')
  anularSalida(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.salidasStockService.anularSalida(id, request.user);
  }

  @Patch(':id/confirmar-bascula')
  confirmarBascula(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmarBasculaDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.salidasStockService.confirmarBascula(id, dto, request.user);
  }

  @Get('stock/buscar')
  buscarStockParaDespacho(@Query() query: any, @Req() request: { user: AuthenticatedUser }) {
    return this.salidasStockService.buscarStockParaDespacho(query, request.user);
  }

  @Get('stock/buscar-medida')
  buscarStockPorMedida(@Query() query: any, @Req() request: { user: AuthenticatedUser }) {
    return this.salidasStockService.buscarStockPorMedida(query, request.user);
  }
}

