import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateRubroDto } from './dto/create-rubro.dto.js';
import { UpdateRubroDto } from './dto/update-rubro.dto.js';
import { RubrosService } from './rubros.service.js';

@Controller('rubros')
@UseGuards(AuthGuard('jwt'))
export class RubrosController {
  constructor(private readonly service: RubrosService) {}

  @Get()
  findAll(@Req() req: { user: AuthenticatedUser }) {
    return this.service.findAll(req.user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.findOne(id, req.user);
  }

  @Post()
  create(@Body() dto: CreateRubroDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRubroDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.remove(id, req.user);
  }
}
