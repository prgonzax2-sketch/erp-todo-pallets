import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

@Injectable()
export class MachineIdService implements OnModuleInit {
  private readonly logger = new Logger(MachineIdService.name);
  private readonly stateDir: string;
  private readonly instanceKeyPath: string;
  private instanceIdValue: string | null = null;

  constructor() {
    this.stateDir = process.env.LICENSE_STATE_PATH || './license';
    this.instanceKeyPath = path.join(this.stateDir, 'instance.key');
  }

  async onModuleInit() {
    try {
      await this.ensureInstanceKey();
    } catch (e) {
      this.logger.warn(`No se pudo inicializar instance.key de licenciamiento: ${(e as Error).message}`);
    }
  }

  getStateDir() {
    return this.stateDir;
  }

  async ensureInstanceKey(): Promise<string> {
    if (this.instanceIdValue) return this.instanceIdValue;
    await fs.mkdir(this.stateDir, { recursive: true });
    try {
      const existing = (await fs.readFile(this.instanceKeyPath, 'utf8')).trim();
      if (existing) {
        this.instanceIdValue = existing;
        return existing;
      }
    } catch {
      // crear
    }
    const key = randomUUID();
    const tmp = this.instanceKeyPath + '.tmp';
    await fs.writeFile(tmp, key + '\n', { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmp, this.instanceKeyPath);
    try { await fs.chmod(this.instanceKeyPath, 0o600); } catch {}
    this.instanceIdValue = key;
    this.logger.log('Generada nueva instance.key para licenciamiento');
    return key;
  }

  async getInstanceId(): Promise<string> {
    return this.ensureInstanceKey();
  }

  async getMachineIdHash(): Promise<string> {
    // hash estable derivado del ancla de instancia (primaria) para identificación de máquina lógica
    const instanceId = await this.getInstanceId();
    return this.sha256(`instance:${instanceId}`);
  }

  async getFingerprintHash(): Promise<string> {
    const parts: string[] = [];
    parts.push(`platform:${os.platform()}`);
    parts.push(`arch:${os.arch()}`);
    parts.push(`hostname:${os.hostname()}`);
    parts.push(`cpu:${os.cpus()?.[0]?.model || ''}`);
    parts.push(`mem:${os.totalmem()}`);
    try {
      const nics = os.networkInterfaces();
      const macs = Object.values(nics)
        .flat()
        .filter((n): n is os.NetworkInterfaceInfo => !!n && !n.internal && !!n.mac && n.mac !== '00:00:00:00:00:00')
        .map((n) => n.mac)
        .sort();
      parts.push(`macs:${macs.join(',')}`);
    } catch {}
    // best-effort señales adicionales
    try {
      if (process.platform === 'linux') {
        const mid = (await fs.readFile('/etc/machine-id', 'utf8')).trim();
        if (mid) parts.push(`machine-id:${mid}`);
      }
    } catch {}
    try {
      if (process.platform === 'win32' && process.env.COMPUTERNAME) {
        parts.push(`computername:${process.env.COMPUTERNAME}`);
      }
    } catch {}
    return this.sha256(parts.join('|'));
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
