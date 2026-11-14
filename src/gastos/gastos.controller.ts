import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { GastosService } from './gastos.service.js';
import { CreateGastoDto } from './dto/create-gasto.dto.js';
import { UpdateGastoDto } from './dto/update-gasto.dto.js';
import { QueryGastoDto } from './dto/query-gasto.dto.js';
import { AnularGastoDto } from './dto/anular-gasto.dto.js';

@Controller('gastos')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class GastosController {
  constructor(private readonly service: GastosService) {}

  @Get()
  findAll(@Query() query: QueryGastoDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.findAll(query, req.user);
  }

  @Post()
  create(@Body() dto: CreateGastoDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.create(dto, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.findOne(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGastoDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Post(':id/confirmar')
  confirmar(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.confirmar(id, req.user);
  }

  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularGastoDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.anular(id, dto, req.user);
  }
}
