import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmpleadosService } from './empleados.service.js';
import { CreateEmpleadoDto } from './dto/create-empleado.dto.js';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('empleados')
@UseGuards(AuthGuard('jwt'))
export class EmpleadosController {
  constructor(private readonly empleadosService: EmpleadosService) {}

  // Puerta 1: POST http://localhost:3000/empleados (Para CREAR)
  @Post()
  create(@Body() createEmpleadoDto: CreateEmpleadoDto, @Req() request: { user: AuthenticatedUser }) {
    return this.empleadosService.create(createEmpleadoDto, request.user);
  }

  // Puerta 2: GET http://localhost:3000/empleados (Para VER TODOS)
  @Get()
  findAll(@Req() request: { user: AuthenticatedUser }, @Query('aserradero') aserradero?: string) {
    return this.empleadosService.findAll(request.user, aserradero);
  }

  // Puerta 3: GET http://localhost:3000/empleados/1 (Para VER UNO ESPECÍFICO)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.empleadosService.findOne(+id, request.user);
  }

  // Puerta 4: PATCH http://localhost:3000/empleados/1 (Para EDITAR/CORREGIR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEmpleadoDto: UpdateEmpleadoDto, @Req() request: { user: AuthenticatedUser }) {
    return this.empleadosService.update(+id, updateEmpleadoDto, request.user);
  }

  @Patch(':id/sueldo-fijo')
  updateFixedSalary(
    @Param('id') id: string,
    @Body() body: { monto: number; aplicarEn: 'actual' | 'siguiente' },
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.empleadosService.updateFixedSalary(+id, body.monto, body.aplicarEn, request.user);
  }

  // Puerta 5: DELETE http://localhost:3000/empleados/1 (Para BORRAR)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.empleadosService.remove(+id, request.user);
  }
}
