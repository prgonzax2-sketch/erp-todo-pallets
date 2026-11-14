import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClientesService } from './clientes.service.js';
import { CreateClienteDto, UpdateClienteDto } from './dto/cliente.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('clientes')
@UseGuards(AuthGuard('jwt'))
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  findAll(@Req() request: { user: AuthenticatedUser }) {
    return this.clientesService.findAll(request.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.clientesService.findOne(id, request.user);
  }

  @Post()
  create(@Body() dto: CreateClienteDto, @Req() request: { user: AuthenticatedUser }) {
    return this.clientesService.create(dto, request.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClienteDto,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.clientesService.update(id, dto, request.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.clientesService.remove(id, request.user);
  }
}

