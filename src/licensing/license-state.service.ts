import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { AppLicensingState } from './entities/app-licensing-state.entity.js';

export type LicensingStateSnapshot = Partial<AppLicensingState> & { id: number };

@Injectable()
export class LicenseStateService implements OnModuleInit {
  private readonly logger = new Logger(LicenseStateService.name);
  private readonly stateDir: string;
  private readonly mirrorPath: string;

  constructor(
    @InjectRepository(AppLicensingState)
    private readonly repo: Repository<AppLicensingState>,
  ) {
    this.stateDir = process.env.LICENSE_STATE_PATH || './license';
    this.mirrorPath = path.join(this.stateDir, 'state.json');
  }

  async onModuleInit() {
    try {
      await this.ensureDir();
      await this.ensureRow();
    } catch (e) {
      this.logger.warn(`No se pudo inicializar estado de licenciamiento (DB/mirror): ${(e as Error).message}`);
    }
  }

  private async ensureDir() {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
    } catch (e) {
      this.logger.warn(`No se pudo crear LICENSE_STATE_PATH ${this.stateDir}: ${(e as Error).message}`);
    }
  }

  async ensureRow(): Promise<AppLicensingState> {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) {
      // Intentar recuperar desde mirror si existe
      const mirrored = await this.readMirror();
      const created = this.repo.create({ id: 1, clockTamperSuspected: false, ...(mirrored || {}) } as any) as unknown as AppLicensingState;
      row = (await this.repo.save(created as any)) as AppLicensingState;
      this.logger.log('Creada fila inicial app_licensing_state (id=1)');
    }
    return row as AppLicensingState;
  }

  async getState(): Promise<AppLicensingState> {
    return this.ensureRow();
  }

  async updateState(patch: Partial<AppLicensingState>): Promise<AppLicensingState> {
    const current = await this.ensureRow();
    const merged = this.repo.merge(current, patch, { id: 1 });
    const saved = await this.repo.save(merged);
    await this.writeMirror(saved);
    return saved;
  }

  private async readMirror(): Promise<Partial<AppLicensingState> | null> {
    try {
      const raw = await fs.readFile(this.mirrorPath, 'utf8');
      const obj = JSON.parse(raw);
      // fechas como strings -> Date en algunos campos
      const dateFields = ['validUntil','graceDeadlineAt','lastCheckAt','lastSuccessfulCheckAt','lastServerTime','updatedAt'];
      for (const f of dateFields) {
        if (obj[f]) obj[f] = new Date(obj[f]);
      }
      return obj;
    } catch {
      return null;
    }
  }

  async writeMirror(state: AppLicensingState) {
    try {
      await this.ensureDir();
      const tmp = this.mirrorPath + '.tmp';
      const plain = { ...state } as any;
      await fs.writeFile(tmp, JSON.stringify(plain, null, 2), 'utf8');
      await fs.rename(tmp, this.mirrorPath);
    } catch (e) {
      this.logger.warn(`No se pudo espejar estado de licencia: ${(e as Error).message}`);
    }
  }

  getStateDir() {
    return this.stateDir;
  }
}
