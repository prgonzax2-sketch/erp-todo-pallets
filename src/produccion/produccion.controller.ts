import { Controller, Post, Get, Body, Query, UseGuards, Req, Patch, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProduccionService } from './produccion.service.js';
import { CreateProduccionEntradaDto, CreateProduccionMasivaDto } from './dto/produccion.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateMesaPalletDto, RegistrarPalletProduccionDto, UpdateMesaPalletDto } from './dto/mesa-pallet.dto.js';

@Controller('produccion')
@UseGuards(AuthGuard('jwt'))
export class ProduccionController {
  constructor(private readonly produccionService: ProduccionService) {}

  @Post('entradas')
  registrarEntrada(@Body() body: CreateProduccionEntradaDto, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.registrarEntrada(body, request.user);
  }

  @Post('entradas-masivas')
  registrarEntradasMasivas(@Body() body: CreateProduccionMasivaDto, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.registrarEntradasMasivas(body, request.user);
  }

  @Patch('entradas/:id')
  actualizarEntrada(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<CreateProduccionEntradaDto>, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.actualizarRegistroStock(id, body, request.user);
  }

  @Delete('entradas/:id')
  eliminarEntrada(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.eliminarRegistroStock(id, request.user);
  }

  @Get('stock')
  listarStock(@Query() query: any, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.listarStock(query, request.user);
  }

  @Patch('lote')
  actualizarLote(@Body() body: { ids: number[]; lote: string; aserradero: string }, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.actualizarLote(body.ids, body.lote, body.aserradero, request.user);
  }

  @Patch('observaciones')
  actualizarObservaciones(@Body() body: { ids: number[]; observaciones: string }, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.actualizarObservaciones(body.ids, body.observaciones, request.user);
  }

  @Get('tags')
  listarTags() {
    return this.produccionService.listarTags();
  }

  @Post('pallet-recipes')
  crearRecetaPallet(@Body() body: any) {
    return this.produccionService.crearRecetaPallet(body);
  }

  @Get('pallet-recipes')
  listarRecetasPallet() {
    return this.produccionService.listarRecetasPallet();
  }

  @Get('pallet-recipes/:id')
  obtenerRecetaPallet(@Param('id', ParseIntPipe) id: number) {
    return this.produccionService.obtenerRecetaPallet(id);
  }

  @Patch('pallet-recipes/:id')
  actualizarRecetaPallet(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.produccionService.actualizarRecetaPallet(id, body);
  }

  @Delete('pallet-recipes/:id')
  eliminarRecetaPallet(@Param('id', ParseIntPipe) id: number) {
    return this.produccionService.eliminarRecetaPallet(id);
  }

  @Post('aprendizaje/learn')
  async learnPaquete(@Body() body: any) {
    return this.produccionService.learnPaquete(body);
  }

  @Get('aprendizaje/suggest')
  async suggestPaquete(@Query() query: any) {
    return this.produccionService.suggestPaquete(query);
  }

  @Post('pallet-produccion')
  registrarProduccionPalletDiaria(@Body() body: RegistrarPalletProduccionDto, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.registrarProduccionPalletDiaria(body as any, request.user);
  }

  // --- Mesas de pallets (reparto automático por operario) ---
  @Post('mesas')
  crearMesa(@Body() body: CreateMesaPalletDto, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.crearMesaPallet(body, request.user);
  }

  @Get('mesas')
  listarMesas(@Query('aserradero') aserradero: string | undefined, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.listarMesasPallet(aserradero, request.user);
  }

  @Get('mesas/:id')
  obtenerMesa(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.obtenerMesaPallet(id, request.user);
  }

  @Patch('mesas/:id')
  actualizarMesa(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateMesaPalletDto, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.actualizarMesaPallet(id, body, request.user);
  }

  @Delete('mesas/:id')
  eliminarMesa(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.produccionService.eliminarMesaPallet(id, request.user);
  }
}