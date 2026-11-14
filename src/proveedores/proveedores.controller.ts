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
import { CreateProveedorDto } from './dto/create-proveedor.dto.js';
import { UpdateProveedorDto } from './dto/update-proveedor.dto.js';
import { ProveedoresService } from './proveedores.service.js';

@Controller('proveedores')
@UseGuards(AuthGuard('jwt'))
export class ProveedoresController {
  constructor(private readonly service: ProveedoresService) {}

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
  create(
    @Body() dto: CreateProveedorDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProveedorDto,
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
