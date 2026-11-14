import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PendientesProduccionService } from './pendientes-produccion.service.js';
import { CreatePendienteProduccionDto, UpdatePendienteProduccionDto } from './dto/pendiente-produccion.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('produccion/pendientes')
@UseGuards(AuthGuard('jwt'))
export class PendientesProduccionController {
  constructor(private readonly pendientesService: PendientesProduccionService) {}

  @Post()
  create(@Body() dto: CreatePendienteProduccionDto, @Req() request: { user: AuthenticatedUser }) {
    return this.pendientesService.create(dto, request.user);
  }

  @Get()
  findAll(@Req() request: { user: AuthenticatedUser }) {
    return this.pendientesService.findAll(request.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.pendientesService.findOne(id, request.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePendienteProduccionDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.pendientesService.update(id, dto, request.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.pendientesService.remove(id, request.user);
  }
}