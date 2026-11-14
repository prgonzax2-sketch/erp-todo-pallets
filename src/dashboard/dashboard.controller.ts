import { Controller, Get, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardStatsQueryDto } from './dto/dashboard-stats-query.dto.js';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  getStats(@Query() query: DashboardStatsQueryDto, @Req() request: { user: AuthenticatedUser }) {
    return this.dashboardService.getStats(query, request.user);
  }
}
