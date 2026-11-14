import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { ConteoPlayaRollosService } from './conteo-playa-rollos.service.js';
import { CreateConteoPlayaRolloDto, ListConteoPlayaQueryDto, ResumenPeriodoConteoQueryDto } from './dto/conteo-playa-rollo.dto.js';

@Controller('conteo-playa-rollos')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ConteoPlayaRollosController {
  constructor(private readonly service: ConteoPlayaRollosService) {}

  @Post()
  create(@Body() dto: CreateConteoPlayaRolloDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.create(dto, req.user);
  }

  @Get()
  list(@Query() query: ListConteoPlayaQueryDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.list(query, req.user);
  }

  @Get('resumen-periodo')
  resumenPeriodo(@Query() query: ResumenPeriodoConteoQueryDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.resumenPeriodo(query, req.user);
  }

  @Get('stock-esperado')
  stockEsperado(@Query('aserradero') aserradero: string, @Req() req: { user: AuthenticatedUser }) {
    return this.service.stockEsperado(req.user, aserradero);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.get(id, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: AuthenticatedUser }) {
    return this.service.remove(id, req.user);
  }
}
