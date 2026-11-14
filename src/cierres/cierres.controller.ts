import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CierresService } from './cierres.service.js';

@Controller('cierres')
@UseGuards(AuthGuard('jwt'))
export class CierresController {
  constructor(private readonly cierresService: CierresService) {}

  @Get('boveda-pagos')
  listarBoveda(@Req() req: { user: AuthenticatedUser }, @Query('aserradero') aserradero?: string) {
    return this.cierresService.listarBoveda(req.user, aserradero);
  }

  @Put('boveda-pagos')
  guardarBoveda(@Req() req: { user: AuthenticatedUser }, @Body() body: any) {
    const pagos = Array.isArray(body) ? body : (body?.pagos || body?.items || []);
    const aserradero = body?.aserradero;
    return this.cierresService.guardarBoveda(req.user, aserradero, pagos);
  }

  @Delete('boveda-pagos/:idUnico')
  eliminarPago(@Req() req: { user: AuthenticatedUser }, @Param('idUnico') idUnico: string, @Query('aserradero') aserradero?: string) {
    return this.cierresService.eliminarPagoBoveda(req.user, idUnico, aserradero);
  }

  @Get('archivos')
  listarArchivos(@Req() req: { user: AuthenticatedUser }, @Query('aserradero') aserradero?: string) {
    return this.cierresService.listarArchivos(req.user, aserradero);
  }

  @Post('archivos')
  agregarArchivo(@Req() req: { user: AuthenticatedUser }, @Body() body: any) {
    return this.cierresService.agregarArchivo(req.user, body?.aserradero, body?.cierre || body);
  }

  @Delete('archivos/:idCierre')
  eliminarArchivo(@Req() req: { user: AuthenticatedUser }, @Param('idCierre') idCierre: string, @Query('aserradero') aserradero?: string) {
    return this.cierresService.eliminarArchivo(req.user, idCierre, aserradero);
  }

  @Get('historial-liquidaciones')
  listarHistorial(@Req() req: { user: AuthenticatedUser }, @Query('aserradero') aserradero?: string) {
    return this.cierresService.listarHistorial(req.user, aserradero);
  }

  @Post('historial-liquidaciones')
  agregarHistorial(@Req() req: { user: AuthenticatedUser }, @Body() body: any) {
    const items = Array.isArray(body) ? body : (body?.items || body?.historial || []);
    return this.cierresService.agregarHistorial(req.user, body?.aserradero, items);
  }

  /** Persiste en PG el cierre de periodo (archivo + historial SAC + bóveda pendientes). */
  @Post('registrar')
  registrar(@Req() req: { user: AuthenticatedUser }, @Body() body: any) {
    return this.cierresService.registrarCierrePeriodo(req.user, body);
  }
}
