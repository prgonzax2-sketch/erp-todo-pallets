import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LicensingService } from './licensing.service.js';

@Injectable()
export class LicenseValidationJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LicenseValidationJob.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly licensingService: LicensingService) {}

  async onModuleInit() {
    // Verificación en arranque (best-effort, no bloquear arranque)
    setTimeout(() => {
      this.licensingService.verifyNow('startup').catch((e) => this.logger.warn(`Startup verify error: ${e?.message}`));
    }, 5000);

    const intervalMs = this.resolveIntervalMs();
    this.logger.log(`Scheduler verificación licencia cada ${Math.round(intervalMs / 3600000)}h (aprox diario)`);
    this.timer = setInterval(() => {
      this.licensingService.verifyNow('scheduled').catch((e) => this.logger.warn(`Scheduled verify error: ${e?.message}`));
    }, intervalMs);
    // evitar que el timer impida salir en tests/procesos cortos
    if (typeof (this.timer as any).unref === 'function') (this.timer as any).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private resolveIntervalMs(): number {
    const raw = process.env.LICENSE_CHECK_INTERVAL_MS;
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 60_000) return n; // mínimo 1 min
    }
    // default diario
    return 24 * 60 * 60 * 1000;
  }
}
