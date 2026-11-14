import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { PlantacionesService } from './plantaciones.service.js';
import { CreatePlantacionDto, UpdatePlantacionDto } from './dto/plantacion.dto.js';

@Controller('plantaciones')
@UseGuards(AuthGuard('jwt'))
export class PlantacionesController {
  constructor(private readonly service: PlantacionesService) {}

  @Get()
  findAll(@Req() req: { user: AuthenticatedUser }) {
    return this.service.findAll(req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.findOne(id, req.user);
  }

  @Post()
  create(@Body() dto: CreatePlantacionDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlantacionDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.remove(id, req.user);
  }
}
