import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { InstallationService } from './installation.service.js';

@Controller('installation')
export class InstallationController {
  constructor(private readonly installationService: InstallationService) {}

  @Get('setup-status')
  async setupStatus() {
    return this.installationService.getSetupStatus();
  }

  @Post('setup-admin')
  @HttpCode(200)
  async setupAdmin(@Body() body: { email?: string; password?: string; nombre?: string }) {
    return this.installationService.createInitialAdmin(body);
  }
}
