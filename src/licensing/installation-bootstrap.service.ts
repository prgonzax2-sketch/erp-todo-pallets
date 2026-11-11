import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { Usuario } from '../auth/entities/usuario.entity.js';
import { AppInstallationState } from './entities/app-installation-state.entity.js';

/**
 * Bootstrap de instalación (F3.3): crea admin inicial one-shot, idempotente.
 * Consulta/actualiza app_installation_state (id=1). No expone endpoint ni reutiliza reset-admin-password.
 */
@Injectable()
export class InstallationBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(InstallationBootstrapService.name);

  constructor(
    @InjectRepository(AppInstallationState)
    private readonly installRepo: Repository<AppInstallationState>,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.run();
    } catch (e) {
      // Resiliencia: no tumbar arranque si DB no lista o falla bootstrap (best-effort).
      this.logger.warn(`Bootstrap instalación (F3.3) no completado: ${(e as Error).message}`);
    }
  }

  private async ensureRow(): Promise<AppInstallationState> {
    let row = await this.installRepo.findOne({ where: { id: 1 } });
    if (!row) {
      row = this.installRepo.create({ id: 1 } as any) as unknown as AppInstallationState;
      row = (await this.installRepo.save(row as any)) as AppInstallationState;
    }
    return row as AppInstallationState;
  }

  private generateSecurePassword(): string {
    // 24 chars url-safe-ish sin caracteres ambiguos problemáticos en logs/console
    return randomBytes(18).toString('base64').replace(/[+/=]/g, (c) => ({ '+': 'A', '/': 'z', '=': '' }[c] as string)).slice(0, 24);
  }

  async run(): Promise<void> {
    const row = await this.ensureRow();
    const appVersion = process.env.APP_VERSION || '0.0.1';

    if (row.adminSeededAt) {
      this.logger.debug('Admin inicial ya sembrado (admin_seeded_at presente); omitiendo.');
      // asegurar initialized/installed_version si faltan (idempotente)
      const patch: Partial<AppInstallationState> = {};
      if (!row.initializedAt) patch.initializedAt = row.adminSeededAt;
      if (!row.installedVersion && appVersion) patch.installedVersion = appVersion;
      if (Object.keys(patch).length) await this.installRepo.save(this.installRepo.merge(row, patch));
      return;
    }

    const existingAdmin = await this.usuarioRepo.findOne({ where: { rol: 'admin', activo: true } });
    if (existingAdmin) {
      const now = new Date();
      await this.installRepo.save(this.installRepo.merge(row, {
        adminSeededAt: row.adminSeededAt || now,
        initializedAt: row.initializedAt || now,
        installedVersion: row.installedVersion || appVersion,
      }));
      this.logger.log('Admin activo existente detectado; estado de instalación marcado (idempotente).');
      return;
    }

    let email = (process.env.INSTALL_ADMIN_EMAIL || '').trim().toLowerCase();
    let password = process.env.INSTALL_ADMIN_PASSWORD || '';
    const generate = String(process.env.INSTALL_ADMIN_GENERATE_PASSWORD || 'false').toLowerCase() === 'true';

    if (!email) {
      // Sin credenciales de seed: no crear admin, pero no es error crítico
      this.logger.log('Bootstrap admin omitido: INSTALL_ADMIN_EMAIL no configurado.');
      return;
    }

    let generatedOnce = false;
    if (!password && generate) {
      password = this.generateSecurePassword();
      generatedOnce = true;
    }

    if (!password) {
      this.logger.warn('Bootstrap admin omitido: falta INSTALL_ADMIN_PASSWORD (o INSTALL_ADMIN_GENERATE_PASSWORD=true).');
      return;
    }

    // conflicto por email existente (no-admin u otro)
    const byEmail = await this.usuarioRepo.findOne({ where: { email } });
    if (byEmail) {
      if (byEmail.rol === 'admin') {
        const now = new Date();
        await this.installRepo.save(this.installRepo.merge(row, {
          adminSeededAt: now,
          initializedAt: row.initializedAt || now,
          installedVersion: row.installedVersion || appVersion,
        }));
        this.logger.log(`Usuario admin con email ${email} ya existe; estado marcado (idempotente).`);
      } else {
        this.logger.warn(`No se pudo sembrar admin: el email ya existe con rol distinto (${byEmail.rol}).`);
      }
      return;
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
    await this.usuarioRepo.save(nuevo);

    const now = new Date();
    await this.installRepo.save(this.installRepo.merge(row, {
      adminSeededAt: now,
      initializedAt: row.initializedAt || now,
      installedVersion: appVersion,
    }));

    this.logger.log(`Admin inicial creado (one-shot, idempotente registrado). Email: ${email}`);
    if (generatedOnce) {
      // Mostrar una sola vez en consola/log de arranque; no persistir en claro.
      this.logger.warn(`CONTRASEÑA ADMIN INICIAL (mostrar una sola vez, guárdela ahora): ${password}`);
    }
  }
}
