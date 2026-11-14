import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PartesDiariosService } from './partes-diarios.service.js';
import { CreateParteDiarioDto } from './dto/create-parte-diario.dto.js';
import { UpdateParteDiarioDto } from './dto/update-parte-diario.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('partes-diarios')
@UseGuards(AuthGuard('jwt'))
export class PartesDiariosController {
  constructor(private readonly partesDiariosService: PartesDiariosService) {}

  @Post()
  create(@Body() createParteDiarioDto: CreateParteDiarioDto, @Req() request: { user: AuthenticatedUser }) {
    return this.partesDiariosService.create(createParteDiarioDto, request.user);
  }

  @Get()
  findAll(@Req() request: { user: AuthenticatedUser }) {
    return this.partesDiariosService.findAll(request.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.partesDiariosService.findOne(+id, request.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateParteDiarioDto: UpdateParteDiarioDto, @Req() request: { user: AuthenticatedUser }) {
    return this.partesDiariosService.update(+id, updateParteDiarioDto, request.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.partesDiariosService.remove(+id, request.user);
  }
}
