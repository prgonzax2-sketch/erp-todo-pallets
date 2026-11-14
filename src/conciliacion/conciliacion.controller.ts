import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { ConciliacionService } from './conciliacion.service.js';
import { ConfirmarSubproductoEgresoDto, CreateSubproductoEgresoDto, ListSubproductoEgresoQueryDto } from './dto/subproducto-egreso.dto.js';
import { UpsertConciliacionConfigDto } from './dto/conciliacion-config.dto.js';
import { ConciliacionResumenQueryDto, RemanenteRollosQueryDto, SubproductosStockQueryDto } from './dto/conciliacion-query.dto.js';

@Controller('conciliacion')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ConciliacionController {
  constructor(private readonly service: ConciliacionService) {}

  @Get('resumen')
  resumen(@Query() q: ConciliacionResumenQueryDto, @Req() req: { user: AuthenticatedUser }) {
    if (q?.global) return this.service.conciliacionGlobalAgregado(req.user, q.desde, q.hasta, q.fecha, q.periodo);
    return this.service.conciliacion(req.user, q?.aserradero);
  }

  @Get('remanente-rollos')
  remanenteRollos(@Query() q: RemanenteRollosQueryDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.remanenteRollos(req.user, q.aserradero, q.fecha);
  }

  @Get('subproductos-stock')
  subproductosStock(@Query() q: SubproductosStockQueryDto, @Req() req: { user: AuthenticatedUser }) {
    if (q?.global) return this.service.subproductosStockGlobal(req.user, q.desde, q.hasta, q.fecha);
    return this.service.subproductosStock(req.user, q.aserradero, q.fecha, q.desde);
  }

  @Get('config')
  getConfig(@Query('aserradero') aserradero: string, @Req() req: { user: AuthenticatedUser }) {
    return this.service.getConfigEfectiva(req.user, aserradero);
  }

  @Put('config')
  putConfig(@Body() dto: UpsertConciliacionConfigDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.upsertConfig(dto, req.user);
  }

  @Delete('config')
  resetConfigAll(@Query('aserradero') aserradero: string, @Req() req: { user: AuthenticatedUser }) {
    return this.service.resetConfigAll(req.user, aserradero);
  }

  @Delete('config/:grupoEspecie')
  resetConfig(@Param('grupoEspecie') grupoEspecie: string, @Query('aserradero') aserradero: string, @Req() req: { user: AuthenticatedUser }) {
    return this.service.resetConfigItem(grupoEspecie, req.user, aserradero);
  }

  @Get('subproductos-egresos')
  listEgresos(@Query() q: ListSubproductoEgresoQueryDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.listEgresos(q, req.user);
  }

  @Post('subproductos-egresos')
  createEgreso(@Body() dto: CreateSubproductoEgresoDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.createEgreso(dto, req.user);
  }

  @Patch('subproductos-egresos/:id/confirmar')
  confirmar(@Param('id', ParseIntPipe) id: number, @Body() dto: ConfirmarSubproductoEgresoDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.confirmarEgreso(id, dto, req.user);
  }
}
