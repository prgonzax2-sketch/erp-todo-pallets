import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdelantosService } from './adelantos.service.js';
import { CreateAdelantoDto } from './dto/create-adelanto.dto.js';
import { UpdateAdelantoDto } from './dto/update-adelanto.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('adelantos')
@UseGuards(AuthGuard('jwt'))
export class AdelantosController {
  constructor(private readonly adelantosService: AdelantosService) {}

  @Post()
  create(@Body() createAdelantoDto: CreateAdelantoDto, @Req() request: { user: AuthenticatedUser }) {
    return this.adelantosService.create(createAdelantoDto, request.user);
  }

  @Get()
  findAll(@Req() request: { user: AuthenticatedUser }) {
    return this.adelantosService.findAll(request.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.adelantosService.findOne(+id, request.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAdelantoDto: UpdateAdelantoDto, @Req() request: { user: AuthenticatedUser }) {
    return this.adelantosService.update(+id, updateAdelantoDto, request.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.adelantosService.remove(+id, request.user);
  }
}
