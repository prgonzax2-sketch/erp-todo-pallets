import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { TransportesService } from './transportes.service.js';
import { CreateTransporteDto, UpdateTransporteDto } from './dto/transporte.dto.js';

@Controller('transportes')
@UseGuards(AuthGuard('jwt'))
export class TransportesController {
  constructor(private readonly service: TransportesService) {}

  @Get()
  findAll(@Req() req: { user: AuthenticatedUser }) {
    return this.service.findAll(req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.findOne(id, req.user);
  }

  @Post()
  create(@Body() dto: CreateTransporteDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTransporteDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.remove(id, req.user);
  }
}
