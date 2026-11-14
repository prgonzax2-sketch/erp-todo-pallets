import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { AserraderosService } from './aserraderos.service.js';

@Controller('aserraderos')
@UseGuards(AuthGuard('jwt'))
export class AserraderosController {
  constructor(private readonly aserraderosService: AserraderosService) {}

  @Get()
  findAll(@Req() request: { user: AuthenticatedUser }) {
    return this.aserraderosService.findAll(request.user);
  }

  @Post()
  create(@Body() body: { nombre: string }, @Req() request: { user: AuthenticatedUser }) {
    return this.aserraderosService.create(body.nombre, request.user);
  }

  @Delete(':id')
  deactivate(@Param('id', ParseIntPipe) id: number, @Req() request: { user: AuthenticatedUser }) {
    return this.aserraderosService.deactivate(id, request.user);
  }
}
