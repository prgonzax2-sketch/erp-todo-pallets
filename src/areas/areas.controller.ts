import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { AreasService } from './areas.service.js';
import { CreateAreaDto } from './dto/create-area.dto.js';
import { UpdateAreaDto } from './dto/update-area.dto.js';

@Controller('areas')
@UseGuards(AuthGuard('jwt'))
export class AreasController {
  constructor(private readonly service: AreasService) {}

  @Get()
  findAll(
    @Req() req: { user: AuthenticatedUser },
    @Query('aserraderoId') aserraderoId?: string,
    @Query('aserradero') aserradero?: string,
  ) {
    const parsedId =
      aserraderoId !== undefined && aserraderoId !== ''
        ? Number(aserraderoId)
        : undefined;
    return this.service.findAll(req.user, {
      aserraderoId: Number.isFinite(parsedId) ? parsedId : undefined,
      aserradero,
    });
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.findOne(id, req.user);
  }

  @Post()
  create(@Body() dto: CreateAreaDto, @Req() req: { user: AuthenticatedUser }) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAreaDto,
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
