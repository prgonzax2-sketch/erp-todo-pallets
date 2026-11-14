import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
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

  private normalizePublicBaseUrl(rawInput: string): string {
    const raw = String(rawInput || '').trim();
    if (!raw) throw new BadRequestException('La URL pública no puede estar vacía.');
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new BadRequestException('La URL pública no es válida. Use formato https://subdominio.dominio');
    }
    if (u.protocol !== 'https:') {
      throw new BadRequestException('La URL pública debe usar HTTPS (ej.: https://cliente-erp.sistemaaserradero.com.ar).');
    }
    if (u.username || u.password) {
      throw new BadRequestException('La URL pública no debe incluir credenciales.');
    }
    // Normalizar como origen (identidad de acceso). Se ignoran path/query/fragment para evitar ambigüedad.
    const origin = u.origin.replace(/\/$/, '');
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) {
      throw new BadRequestException('La URL pública tiene un formato no permitido.');
    }
    return origin;
  }

  async readConfiguredPublicUrl(): Promise<string | null> {
    // 1) Persistencia local (identidad por instalación)
    try {
      const p = path.join(this.stateDir, 'server_public_url.txt');
      const raw = (await fs.readFile(p, 'utf8')).trim();
      if (raw) {
        try {
          return this.normalizePublicBaseUrl(raw);
        } catch {
          this.logger.warn('server_public_url.txt contiene una URL inválida; se ignora.');
        }
      }
    } catch {
      // no configurado
    }
    // 2) Variables de entorno (preconfig/deploy)
    const envUrl = String(process.env.PUBLIC_BASE_URL || process.env.SERVER_PUBLIC_URL || '').trim();
    if (envUrl) {
      try {
        return this.normalizePublicBaseUrl(envUrl);
      } catch {
        this.logger.warn('PUBLIC_BASE_URL/SERVER_PUBLIC_URL inválida en entorno; se ignora.');
      }
    }
    return null;
  }

  async writeConfiguredPublicUrl(url: string | null): Promise<string | null> {
    const p = path.join(this.stateDir, 'server_public_url.txt');
    await fs.mkdir(this.stateDir, { recursive: true });
    if (url == null || String(url).trim() === '') {
      try { await fs.unlink(p); } catch { /* ignore */ }
      return null;
    }
    const normalized = this.normalizePublicBaseUrl(url);
    const tmp = p + '.tmp';
    await fs.writeFile(tmp, normalized + '\n', { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmp, p);
    try { await fs.chmod(p, 0o600); } catch { }
    return normalized;
  }

  async readTunnelUrl(): Promise<string | null> {
    try {
      const p = path.join(this.stateDir, 'tunnel_url.txt');
      const raw = (await fs.readFile(p, 'utf8')).trim();
      if (!raw) return null;
      // aceptar URLs https (quick tunnel u otro túnel activo)
      if (/^https:\/\//i.test(raw)) {
        try {
          const u = new URL(raw);
          return u.origin.replace(/\/$/, '');
        } catch {
          return raw.replace(/\/$/, '');
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private getLanAccessUrls(appPort: number) {
    const urls: { ip: string; url: string; interface: string }[] = [];
    try {
      const nets = os.networkInterfaces();
      for (const [name, addrs] of Object.entries(nets)) {
        for (const addr of addrs || []) {
          if (!addr || addr.internal) continue;
          const family = String((addr as any).family || '');
          const isV4 = family === 'IPv4' || family === '4';
          if (!isV4) continue;
          const ip = String(addr.address || '').trim();
          if (!ip) continue;
          urls.push({ ip, url: `http://${ip}:${appPort}`, interface: name });
        }
      }
    } catch {
      // best-effort
    }
    // Preferir redes privadas comunes primero
    const score = (ip: string) => {
      if (ip.startsWith('192.168.')) return 0;
      if (ip.startsWith('10.')) return 1;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2;
      return 3;
    };
    urls.sort((a, b) => score(a.ip) - score(b.ip) || a.interface.localeCompare(b.interface) || a.ip.localeCompare(b.ip));
    // dedupe por ip
    const seen = new Set<string>();
    return urls.filter((u) => (seen.has(u.ip) ? false : (seen.add(u.ip), true)));
  }

  async getSetupStatus() {
    const hasAdmin = await this.hasAdmin();
    const [configuredPublicUrl, dynamicTunnelUrl] = await Promise.all([
      this.readConfiguredPublicUrl(),
      this.readTunnelUrl(),
    ]);
    const appPortRaw = Number(process.env.PORT || process.env.APP_PORT || 3000);
    const appPort = Number.isFinite(appPortRaw) && appPortRaw > 0 ? appPortRaw : 3000;
    const localUrl = `http://localhost:${appPort}`;
    const lanAccess = this.getLanAccessUrls(appPort);
    const effectivePublicUrl = configuredPublicUrl || dynamicTunnelUrl || null;
    return {
      needsSetup: !hasAdmin,
      hasAdmin,
      localUrl,
      // Compat: publicUrl/tunnelUrl preferían el túnel dinámico; ahora priorizan URL propia configurada y conservan dinámica.
      publicUrl: effectivePublicUrl,
      tunnelUrl: dynamicTunnelUrl,
      configuredPublicUrl,
      dynamicTunnelUrl,
      serverPublicUrl: configuredPublicUrl,
      appPort,
      lanAccessUrls: lanAccess.map((x) => x.url),
      lanAccess,
      serverHostname: os.hostname(),
    };
  }

  async setServerPublicUrl(body: { url?: string; remove?: boolean }, opts?: { allowWhenAdminExists?: boolean }) {
    const hasAdmin = await this.hasAdmin();
    if (hasAdmin && !opts?.allowWhenAdminExists) {
      throw new ForbiddenException('La configuración inicial ya fue completada. Solo un administrador puede modificar la URL del servidor.');
    }
    const remove = !!body?.remove || !String(body?.url || '').trim();
    const saved = remove ? await this.writeConfiguredPublicUrl(null) : await this.writeConfiguredPublicUrl(String(body?.url || ''));
    return {
      ok: true,
      configuredPublicUrl: saved,
      serverPublicUrl: saved,
      message: saved
        ? 'URL pública del servidor guardada para esta instalación.'
        : 'URL pública configurada eliminada. Se usará la URL dinámica del túnel (si está disponible).',
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
