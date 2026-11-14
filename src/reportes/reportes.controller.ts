import { Controller, Get, Header, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReportesQueryDto } from './dto/reportes-query.dto.js';
import { ReportesService } from './reportes.service.js';

@Controller('reportes')
@UseGuards(AuthGuard('jwt'))
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  private async maybeCsv(res: Response, format: string | undefined, filename: string, csv: string) {
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.end(Buffer.from(csv, 'utf8'));
      return true;
    }
    return false;
  }

  @Get('produccion')
  async produccion(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.produccion(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-produccion-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.produccionCsv(data))) return;
    return data;
  }

  @Get('ventas')
  async ventas(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.ventas(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-ventas-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.ventasCsv(data))) return;
    return data;
  }

  @Get('pedidos')
  async pedidos(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.pedidos(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-pedidos-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.pedidosCsv(data))) return;
    return data;
  }

  @Get('gastos')
  async gastos(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.gastos(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-gastos-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.gastosCsv(data))) return;
    return data;
  }

  @Get('rollos')
  async rollos(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.rollos(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-rollos-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.rollosCsv(data))) return;
    return data;
  }

  @Get('fleteros')
  async fleteros(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.fleteros(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-fleteros-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.fleterosCsv(data))) return;
    return data;
  }

  @Get('rrhh-partes')
  async rrhhPartes(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.rrhhPartes(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-rrhh-partes-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.rrhhPartesCsv(data))) return;
    return data;
  }

  @Get('empleados')
  async empleados(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.empleados(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-empleados-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.empleadosCsv(data))) return;
    return data;
  }

  @Get('subproductos')
  async subproductos(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.subproductos(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-subproductos-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.subproductosCsv(data))) return;
    return data;
  }

  @Get('pallets')
  async pallets(@Query() query: ReportesQueryDto, @Req() req: { user: AuthenticatedUser }, @Res({ passthrough: true }) res: Response) {
    const data = await this.service.pallets(query, req.user);
    if (await this.maybeCsv(res, query.format, `reporte-pallets-${data.meta.desde}-a-${data.meta.hasta}.csv`, this.service.palletsCsv(data))) return;
    return data;
  }
}
