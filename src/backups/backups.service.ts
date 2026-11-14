import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Repository } from 'typeorm';
import { BackupConfig } from './entities/backup-config.entity.js';
import { BackupRun } from './entities/backup-run.entity.js';

@Injectable()
export class BackupsService implements OnModuleInit {
  private timer?: NodeJS.Timeout;
  private backupInProgress = false;
  private readonly backupDirectory = process.env.BACKUP_DIRECTORY ?? '/backups';

  constructor(
    @InjectRepository(BackupConfig) private readonly configRepository: Repository<BackupConfig>,
    @InjectRepository(BackupRun) private readonly runRepository: Repository<BackupRun>,
  ) {}

  async onModuleInit() {
    this.schedule();
  }

  async getConfig() {
    let config = await this.configRepository.findOne({ where: {} });
    if (!config) {
      config = await this.configRepository.save(this.configRepository.create({}));
    }
    return config;
  }

  async updateConfig(values: Partial<UpdateBackupConfigValues>) {
    const config = await this.getConfig();
    Object.assign(config, values);
    const savedConfig = await this.configRepository.save(config);
    this.schedule();
    return savedConfig;
  }

  listRuns() {
    return this.runRepository.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  async runNow() {
    if (this.backupInProgress) {
      throw new Error('Ya hay un respaldo en ejecucion.');
    }

    const config = await this.getConfig();
    if (!config.localEnabled) {
      throw new Error('El respaldo local esta deshabilitado.');
    }

    this.backupInProgress = true;
    mkdirSync(this.backupDirectory, { recursive: true });
    const fileName = `erp-todo-pallets-${this.timestamp()}.dump`;
    const filePath = join(this.backupDirectory, fileName);
    const run = await this.runRepository.save(
      this.runRepository.create({ fileName, status: 'running', cloudStatus: 'disabled' }),
    );

    try {
      await this.dumpDatabase(filePath);
      const fileSizeBytes = statSync(filePath).size;
      run.status = 'completed';
      run.fileSizeBytes = fileSizeBytes;
      await this.runRepository.save(run);
      await this.removeExpiredBackups(config.retentionDays);
      return run;
    } catch (error) {
      run.status = 'failed';
      run.errorMessage = error instanceof Error ? error.message : 'Error desconocido al crear el respaldo.';
      await this.runRepository.save(run);
      if (existsSync(filePath)) unlinkSync(filePath);
      throw error;
    } finally {
      this.backupInProgress = false;
    }
  }

  private schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => { void this.evaluateSchedule().catch(() => undefined); }, 60 * 1000);
    void this.evaluateSchedule().catch(() => undefined);
  }

  private async evaluateSchedule() {
    if (this.backupInProgress) return;

    const config = await this.getConfig();
    if (!config.localEnabled) return;

    const now = new Date();
    const [hours, minutes] = this.parseBackupTime(config.backupTime);
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (now < target) return;

    const latestRun = await this.runRepository.findOne({ where: {}, order: { createdAt: 'DESC' } });
    if (latestRun?.status === 'running') return;

    if (latestRun?.status === 'completed'
      && this.sameLocalDay(latestRun.createdAt, now)
      && latestRun.createdAt >= target) return;

    if (latestRun?.status === 'failed' && now.getTime() - latestRun.createdAt.getTime() < 60 * 60 * 1000) return;

    await this.runNow().catch(() => undefined);
  }

  private parseBackupTime(value: string | undefined): [number, number] {
    const normalizedValue = value ?? '20:00';
    const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(normalizedValue);
    if (!match) return [20, 0];
    const [hours, minutes] = normalizedValue.split(':').map(Number);
    return [hours, minutes];
  }

  private sameLocalDay(first: Date, second: Date) {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }

  private dumpDatabase(filePath: string) {
    const childProcess = spawn(process.env.PG_DUMP_PATH ?? 'pg_dump', [
      '--format=custom',
      '--file',
      filePath,
      '--host',
      process.env.DB_HOST ?? 'localhost',
      '--port',
      process.env.DB_PORT ?? '5432',
      '--username',
      process.env.DB_USERNAME ?? 'admin',
      process.env.DB_NAME ?? 'erp_database',
    ], {
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD ?? 'superpassword123' },
    });

    return new Promise<void>((resolve, reject) => {
      let errorOutput = '';
      childProcess.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString(); });
      childProcess.on('error', reject);
      childProcess.on('close', (code: number | null) => {
        if (code === 0) resolve();
        else reject(new Error(errorOutput || `pg_dump finalizo con codigo ${code}.`));
      });
    });
  }

  private async removeExpiredBackups(retentionDays: number) {
    if (!existsSync(this.backupDirectory)) return;
    const expiration = Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
    for (const fileName of readdirSync(this.backupDirectory)) {
      if (!fileName.endsWith('.dump')) continue;
      const filePath = join(this.backupDirectory, fileName);
      if (statSync(filePath).mtimeMs < expiration) unlinkSync(filePath);
    }
  }

  private timestamp() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date()).reduce<Record<string, string>>((values, part) => {
      values[part.type] = part.value;
      return values;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`;
  }
}

type UpdateBackupConfigValues = {
  localEnabled?: boolean;
  backupTime?: string;
  retentionDays?: number;
};