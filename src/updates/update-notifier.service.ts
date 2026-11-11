import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPublicKey } from 'node:crypto';
import { importSPKI, jwtVerify, JWTPayload } from 'jose';
import { LicenseStateService } from '../licensing/license-state.service.js';

@Injectable()
export class UpdateNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UpdateNotifierService.name);
  private timer: NodeJS.Timeout | null = null;
  private cachedKey: CryptoKey | null = null;
  private cachedKeyPem: string | null = null;

  constructor(private readonly licenseState: LicenseStateService) {}

  async onModuleInit() {
    setTimeout(() => {
      this.checkForUpdate().catch((e) => this.logger.warn(`Startup update check error: ${e?.message}`));
    }, 8000);
    // chequeo diario junto con licencia
    const intervalMs = this.resolveIntervalMs();
    this.timer = setInterval(() => {
      this.checkForUpdate().catch((e) => this.logger.warn(`Scheduled update check error: ${e?.message}`));
    }, intervalMs);
    if (typeof (this.timer as any).unref === 'function') (this.timer as any).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private resolveIntervalMs(): number {
    const raw = process.env.LICENSE_CHECK_INTERVAL_MS;
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 60_000) return n;
    }
    return 24 * 60 * 60 * 1000;
  }

  private async getPublicKey(): Promise<CryptoKey | null> {
    let pem = (process.env.LICENSE_PUBLIC_KEY_PEM || '').trim();
    if (!pem) return null;
    pem = pem.replace(/\\n/g, '\n');
    if (this.cachedKey && this.cachedKeyPem === pem) return this.cachedKey;
    try {
      const keyObj = createPublicKey(pem);
      const spki = keyObj.export({ type: 'spki', format: 'pem' }).toString();
      this.cachedKey = await importSPKI(spki, 'RS256');
      this.cachedKeyPem = pem;
      return this.cachedKey;
    } catch (e) {
      this.logger.error(`No se pudo importar LICENSE_PUBLIC_KEY_PEM para updates: ${(e as Error).message}`);
      return null;
    }
  }

  async checkForUpdate(): Promise<{ ok: boolean; updateAvailable: boolean; latest?: string | null; message?: string; meta?: any }> {
    const baseUrl = (process.env.LICENSE_SERVER_URL || '').replace(/\/$/, '');
    const channel = process.env.UPDATE_CHANNEL || 'stable';
    const current = process.env.APP_VERSION || '0.0.1';
    if (!baseUrl) {
      return { ok: false, updateAvailable: false, message: 'LICENSE_SERVER_URL no configurado' };
    }
    try {
      const url = `${baseUrl}/v1/releases/latest?channel=${encodeURIComponent(channel)}&current=${encodeURIComponent(current)}`;
      const res = await fetch(url, { method: 'GET', headers: { 'accept': 'application/json' } });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`releases http ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);

      let manifestPayload: any = data?.manifest ?? data;
      // manifest puede ser JWS string firmado
      if (typeof manifestPayload === 'string') {
        manifestPayload = await this.verifyManifestJws(manifestPayload);
      } else if (manifestPayload && typeof manifestPayload.manifest_jws === 'string') {
        manifestPayload = await this.verifyManifestJws(manifestPayload.manifest_jws);
      } else if (data && typeof data.manifest_jws === 'string') {
        manifestPayload = await this.verifyManifestJws(data.manifest_jws);
      }
      // si viene plano sin firma, solo aceptar si no hay key configurada? requisito dice verificar firma RS256 -> exigir si key presente
      const key = await this.getPublicKey();
      if (key && typeof (data?.manifest ?? data) !== 'string' && typeof data?.manifest_jws !== 'string' && typeof manifestPayload?.manifest_jws !== 'string') {
        // intento verificar campo jws alternativo
        if (typeof data?.jws === 'string') manifestPayload = await this.verifyManifestJws(data.jws);
        else {
          // sin jws verificable pero key configurada: no confiar
          throw new Error('Manifiesto de release sin JWS firmado verificable');
        }
      }

      const latest = (manifestPayload?.version || manifestPayload?.latest_version || data?.version || null) as string | null;
      const updateAvailable = !!latest && latest !== current;
      await this.licenseState.updateState({
        updateAvailableVersion: updateAvailable ? latest : null,
        updateManifestMeta: {
          channel,
          current,
          latest,
          image_ref: manifestPayload?.image_ref ?? manifestPayload?.imageRef ?? null,
          image_digest_sha256: manifestPayload?.image_digest_sha256 ?? manifestPayload?.imageDigest ?? null,
          mandatory: manifestPayload?.mandatory ?? null,
          min_supported_version: manifestPayload?.min_supported_version ?? null,
          published_at: manifestPayload?.published_at ?? null,
          checkedAt: new Date().toISOString(),
        },
      });
      return { ok: true, updateAvailable, latest, meta: manifestPayload };
    } catch (e) {
      const msg = (e as Error).message || String(e);
      this.logger.warn(`No se pudo consultar updates: ${msg}`);
      return { ok: false, updateAvailable: false, message: msg };
    }
  }

  private async verifyManifestJws(jws: string): Promise<JWTPayload & Record<string, any>> {
    const key = await this.getPublicKey();
    if (!key) throw new Error('LICENSE_PUBLIC_KEY_PEM no configurada para verificar manifiesto');
    const { payload } = await jwtVerify(jws, key, { algorithms: ['RS256'], clockTolerance: Number(process.env.LICENSE_CLOCK_SKEW_SEC || 300) });
    return payload as any;
  }

  async getStatus() {
    const state = await this.licenseState.getState();
    const current = process.env.APP_VERSION || '0.0.1';
    const latest = state.updateAvailableVersion || null;
    return {
      currentVersion: current,
      channel: process.env.UPDATE_CHANNEL || 'stable',
      updateAvailable: !!latest && latest !== current,
      availableVersion: latest,
      manifest: state.updateManifestMeta ?? null,
      autoEnabled: String(process.env.UPDATES_AUTO_ENABLED || 'false').toLowerCase() === 'true',
    };
  }
}
