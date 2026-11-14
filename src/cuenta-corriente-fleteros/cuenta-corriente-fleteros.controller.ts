import { Body, Controller, Get, Header, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CuentaCorrienteFleterosService } from './cuenta-corriente-fleteros.service.js';
import { CreateMovimientoDebitoCcDto, ListMovimientosCcDto } from './dto/movimiento-cc-fletero.dto.js';

@Controller('cuenta-corriente-fleteros')
@UseGuards(AuthGuard('jwt'))
export class CuentaCorrienteFleterosController {
  constructor(private readonly service: CuentaCorrienteFleterosService) {}

  @Post('movimientos')
  registrarDebito(@Body() dto: CreateMovimientoDebitoCcDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.registrarDebito(dto, req.user);
  }

  @Get('movimientos')
  listar(@Query() query: ListMovimientosCcDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.listarMovimientos(query, req.user);
  }

  @Get('resumen')
  resumen(@Query() query: ListMovimientosCcDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.resumen(query, req.user);
  }

  @Get('export/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="cuenta-corriente-fleteros.csv"')
  exportCsv(@Query() query: ListMovimientosCcDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.exportCsv(query, req.user);
  }
}
