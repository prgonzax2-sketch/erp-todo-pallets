import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { IngresoRollosService } from './ingreso-rollos.service.js';
import { CreateIngresoRolloDto, ListIngresoRollosDto, UpdateIngresoRolloDto } from './dto/ingreso-rollo.dto.js';

@Controller('ingreso-rollos')
@UseGuards(AuthGuard('jwt'))
export class IngresoRollosController {
  constructor(private readonly service: IngresoRollosService) {}

  @Get()
  findAll(@Query() query: ListIngresoRollosDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.findAll(query, req.user);
  }

  @Get('export/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ingreso-rollos.csv"')
  exportCsv(@Query() query: ListIngresoRollosDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.exportCsv(query, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.findOne(id, req.user);
  }

  @Post()
  create(@Body() dto: CreateIngresoRolloDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIngresoRolloDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.remove(id, req.user);
  }
}
