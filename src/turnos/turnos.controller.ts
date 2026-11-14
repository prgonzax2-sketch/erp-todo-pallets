import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { TurnosService } from './turnos.service.js';

@Controller('turnos')
@UseGuards(AuthGuard('jwt'))
export class TurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  @Post('borrador')
  guardarBorrador(@Body() body: any, @Req() request: { user: AuthenticatedUser }) {
    return this.turnosService.guardarBorrador(body, request.user);
  }

  /** Carga masiva de borradores en una sola petición (reduce presión de rate limit). */
  @Post('borrador/bulk')
  guardarBorradorBulk(@Body() body: any, @Req() request: { user: AuthenticatedUser }) {
    return this.turnosService.guardarBorradoresBulk(body, request.user);
  }

  @Get('rango')
  obtenerRango(@Query('desde') desde: string, @Query('hasta') hasta: string, @Req() request: { user: AuthenticatedUser }) {
    return this.turnosService.obtenerRango(desde, hasta, request.user);
  }

  @Post('cerrar-rango')
  cerrarRango(@Body() body: any, @Req() request: { user: AuthenticatedUser }) {
    return this.turnosService.cerrarRango(body, request.user);
  }

  /** Volcado idempotente JSON -> PG (admin). ?dryRun=true no escribe. */
  @Post('migrar-json-a-db')
  migrarJsonADb(@Query('dryRun') dryRun: string | undefined, @Req() request: { user: AuthenticatedUser }) {
    const dry = String(dryRun || '').toLowerCase() === 'true' || dryRun === '1';
    return this.turnosService.migrarJsonADb(request.user, dry);
  }
}