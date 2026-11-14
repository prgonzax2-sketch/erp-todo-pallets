import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LiquidacionesService } from './liquidaciones.service.js';
import { CreateLiquidacionDto } from './dto/create-liquidacion.dto.js';
import { UpdateLiquidacionDto } from './dto/update-liquidacion.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('liquidaciones')
@UseGuards(AuthGuard('jwt'))
export class LiquidacionesController {
  constructor(private readonly liquidacionesService: LiquidacionesService) {}

  @Post()
  create(@Body() createLiquidacionDto: CreateLiquidacionDto, @Req() request: { user: AuthenticatedUser }) {
    return this.liquidacionesService.create(createLiquidacionDto, request.user);
  }

  @Get()
  findAll(@Req() request: { user: AuthenticatedUser }) {
    return this.liquidacionesService.findAll(request.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.liquidacionesService.findOne(+id, request.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateLiquidacionDto: UpdateLiquidacionDto, @Req() request: { user: AuthenticatedUser }) {
    return this.liquidacionesService.update(+id, updateLiquidacionDto, request.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.liquidacionesService.remove(+id, request.user);
  }
}
