import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { Roles } from './decorators/roles.decorator.js';
import { AuthenticatedUser } from './auth.types.js';
import { GeneralAdminGuard } from './guards/general-admin.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Límite estricto anti fuerza bruta: 5 intentos por minuto por IP.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async register(@Body() body: { email: string; password: string; rol?: string; empleadoId?: number; aserradero?: string }, @Req() request: { user: AuthenticatedUser }) {
    const rol = body.rol === 'admin' ? 'admin' : 'empleado';
    const aserraderoSolicitado = body.aserradero?.trim();
    if (request.user.aserradero && aserraderoSolicitado && request.user.aserradero !== aserraderoSolicitado) {
      throw new ForbiddenException('No puedes asignar usuarios a otro aserradero.');
    }
    const aserradero = rol === 'admin' ? request.user.aserradero || aserraderoSolicitado : undefined;
    return await this.authService.register(body.email, body.password, rol, body.empleadoId, aserradero);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, GeneralAdminGuard)
  listarUsuarios() {
    return this.authService.listarUsuarios();
  }

  @Patch('users/:id/access')
  @UseGuards(JwtAuthGuard, GeneralAdminGuard)
  actualizarAcceso(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { email: string; password?: string },
  ) {
    return this.authService.actualizarAcceso(id, body.email, body.password);
  }
}