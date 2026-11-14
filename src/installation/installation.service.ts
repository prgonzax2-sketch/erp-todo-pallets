import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Usuario } from '../auth/entities/usuario.entity.js';
import { AppInstallationState } from '../licensing/entities/app-installation-state.entity.js';

@Injectable()
export class InstallationService {
  private readonly logger = new Logger(InstallationService.name);
  private readonly stateDir = process.env.LICENSE_STATE_PATH || './license';

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(AppInstallationState)
    private readonly installRepo: Repository<AppInstallationState>,
  ) {}

  getStateDir() {
    return this.stateDir;
  }

  async readTunnelUrl(): Promise<string | null> {
    try {
      const p = path.join(this.stateDir, 'tunnel_url.txt');
      const raw = (await fs.readFile(p, 'utf8')).trim();
      if (!raw) return null;
      // aceptar solo URLs https del quick tunnel
      if (/^https:\/\/[a-z0-9.-]+\.trycloudflare\.com\/?$/i.test(raw) || /^https:\/\//i.test(raw)) {
        return raw.replace(/\/$/, '');
      }
      return null;
    } catch {
      return null;
    }
  }

  async getSetupStatus() {
    const hasAdmin = await this.hasAdmin();
    const tunnelUrl = await this.readTunnelUrl();
    const appPort = Number(process.env.PORT || process.env.APP_PORT || 3000);
    const localUrl = `http://localhost:${Number.isFinite(appPort) && appPort > 0 ? appPort : 3000}`;
    return {
      needsSetup: !hasAdmin,
      hasAdmin,
      localUrl,
      publicUrl: tunnelUrl,
      tunnelUrl,
      appPort: Number.isFinite(appPort) && appPort > 0 ? appPort : 3000,
    };
  }

  async hasAdmin(): Promise<boolean> {
    const existingAdmin = await this.usuarioRepo.findOne({ where: { rol: 'admin', activo: true } });
    return !!existingAdmin;
  }

  private async ensureInstallRow(): Promise<AppInstallationState> {
    let row = await this.installRepo.findOne({ where: { id: 1 } });
    if (!row) {
      row = this.installRepo.create({ id: 1 } as any) as unknown as AppInstallationState;
      row = (await this.installRepo.save(row as any)) as AppInstallationState;
    }
    return row as AppInstallationState;
  }

  async createInitialAdmin(body: { email?: string; password?: string; nombre?: string }) {
    if (await this.hasAdmin()) {
      throw new BadRequestException('La configuración inicial ya fue completada: ya existe un administrador.');
    }

    const email = (body?.email || '').trim().toLowerCase();
    const password = body?.password || '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Ingresa un correo/usuario válido (email).');
    }
    if (!password || password.length < 6) {
      throw new BadRequestException('La contraseña debe tener al menos 6 caracteres.');
    }

    const byEmail = await this.usuarioRepo.findOne({ where: { email } });
    if (byEmail) {
      throw new BadRequestException('El correo ya está registrado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const nuevo = this.usuarioRepo.create({
      email,
      passwordHash,
      rol: 'admin',
      aserradero: null,
      empleadoId: null,
      activo: true,
    } as any);
    const saved = await this.usuarioRepo.save(nuevo) as unknown as Usuario;

    // Marcar estado de instalación (idempotente/consistente con bootstrap)
    try {
      const row = await this.ensureInstallRow();
      const now = new Date();
      const appVersion = process.env.APP_VERSION || '0.0.1';
      await this.installRepo.save(this.installRepo.merge(row, {
        adminSeededAt: row.adminSeededAt || now,
        initializedAt: row.initializedAt || now,
        installedVersion: row.installedVersion || appVersion,
      }));
    } catch (e) {
      this.logger.warn(`No se pudo actualizar app_installation_state tras crear admin inicial: ${(e as Error).message}`);
    }

    return {
      ok: true,
      message: 'Administrador general creado correctamente.',
      user: { id: saved.id, email: saved.email, rol: saved.rol },
    };
  }
}
