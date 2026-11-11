import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey } from 'node:crypto';
import { importSPKI, jwtVerify, JWTPayload } from 'jose';
import { LicenseStateService } from './license-state.service.js';
import { MachineIdService } from './machine-id.service.js';
import { AppLicensingState } from './entities/app-licensing-state.entity.js';

export type EnforcementMode = 'off' | 'warn' | 'grace' | 'strict';

export interface LicenseStatusView {
  enforcementMode: EnforcementMode;
  licenseStatus: string | null;
  planCode: string | null;
  validUntil: string | null;
  graceDeadlineAt: string | null;
  lastCheckAt: string | null;
  lastSuccessfulCheckAt: string | null;
  lastServerTime: string | null;
  clockTamperSuspected: boolean;
  lastError: string | null;
  appVersion: string | null;
  instanceId: string | null;
  machineIdHash: string | null;
  fingerprintHash: string | null;
  updateAvailableVersion: string | null;
  blocked: boolean;
  blockReason: string | null;
}

@Injectable()
export class LicensingService {
  private readonly logger = new Logger(LicensingService.name);
  private cachedKey: CryptoKey | null = null;
  private cachedKeyPem: string | null = null;

  constructor(
    private readonly stateService: LicenseStateService,
    private readonly machineIdService: MachineIdService,
  ) {}

  getServerUrl() {
    return (process.env.LICENSE_SERVER_URL || '').replace(/\/$/, '');
  }

  getEnforcementMode(): EnforcementMode {
    const m = (process.env.LICENSE_ENFORCEMENT || 'grace').toLowerCase();
    if (m === 'off' || m === 'warn' || m === 'grace' || m === 'strict') return m;
    return 'grace';
  }

  getGraceHoursDefault() {
    const n = Number(process.env.LICENSE_GRACE_HOURS || 72);
    return Number.isFinite(n) && n >= 0 ? n : 72;
  }

  getClockSkewSec() {
    const n = Number(process.env.LICENSE_CLOCK_SKEW_SEC || 300);
    return Number.isFinite(n) && n >= 0 ? n : 300;
  }

  private async getPublicKey(): Promise<CryptoKey | null> {
    let pem = (process.env.LICENSE_PUBLIC_KEY_PEM || '').trim();
    if (!pem) return null;
    // soportar \n escapados en env
    pem = pem.replace(/\\n/g, '\n');
    if (this.cachedKey && this.cachedKeyPem === pem) return this.cachedKey;
    try {
      // normalizar PEM
      const keyObj = createPublicKey(pem);
      const spki = keyObj.export({ type: 'spki', format: 'pem' }).toString();
      this.cachedKey = await importSPKI(spki, 'RS256');
      this.cachedKeyPem = pem;
      return this.cachedKey;
    } catch (e) {
      this.logger.error(`No se pudo importar LICENSE_PUBLIC_KEY_PEM: ${(e as Error).message}`);
      return null;
    }
  }

  async verifyNow(reason: 'startup' | 'scheduled' | 'manual' = 'manual'): Promise<{ ok: boolean; state: AppLicensingState; message?: string }> {
    const baseUrl = this.getServerUrl();
    const appVersion = process.env.APP_VERSION || '0.0.1';
    const instanceId = await this.machineIdService.getInstanceId();
    const machineIdHash = await this.machineIdService.getMachineIdHash();
    const fingerprintHash = await this.machineIdService.getFingerprintHash();
    const now = new Date();

    const basePatch: Partial<AppLicensingState> = {
      instanceId,
      machineIdHash,
      fingerprintHash,
      appVersion,
      enforcementMode: this.getEnforcementMode(),
      lastCheckAt: now,
    };

    if (!baseUrl) {
      const state = await this.stateService.updateState({
        ...basePatch,
        lastError: 'LICENSE_SERVER_URL no configurado',
      });
      return { ok: false, state, message: 'LICENSE_SERVER_URL no configurado' };
    }

    try {
      const res = await fetch(`${baseUrl}/v1/license/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ machine_id_hash: machineIdHash, instance_id: instanceId, fingerprint_hash: fingerprintHash, app_version: appVersion }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`verify http ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
      }
      const token: string | undefined = data?.token;
      const serverTimeStr: string | undefined = data?.server_time;
      if (!token) throw new Error('Respuesta sin token');

      const verified = await this.verifyToken(token, { machineIdHash, instanceId });
      const payload = verified.payload;
      const serverTime = this.parseDate(serverTimeStr) || this.claimDate(payload, 'server_time') || now;
      const validUntil = this.claimDate(payload, 'valid_until') || this.claimDate(payload, 'exp');
      const graceHours = Number(payload['grace_hours'] ?? this.getGraceHoursDefault());
      const graceMs = (Number.isFinite(graceHours) ? graceHours : this.getGraceHoursDefault()) * 3600_000;
      const graceDeadlineAt = validUntil ? new Date(validUntil.getTime() + graceMs) : null;
      const status = String(payload['license_status'] || payload['status'] || 'ACTIVE');

      const current = await this.stateService.getState();
      const clockTamper = this.detectClockTamper(now, serverTime, current.lastServerTime);

      const state = await this.stateService.updateState({
        ...basePatch,
        licenseStatus: status,
        planCode: (payload['plan'] as string) || (payload['plan_code'] as string) || current.planCode || null,
        validUntil,
        graceDeadlineAt,
        lastSuccessfulCheckAt: now,
        lastServerTime: serverTime,
        lastTokenJws: token,
        lastError: null,
        clockTamperSuspected: clockTamper ? true : current.clockTamperSuspected || false,
      });
      return { ok: true, state, message: clockTamper ? 'Verificado, pero se detectó posible clock rollback' : 'Verificación exitosa' };
    } catch (e) {
      const msg = (e as Error).message || String(e);
      this.logger.warn(`Fallo verificación licencia (${reason}): ${msg}`);
      const state = await this.stateService.updateState({
        ...basePatch,
        lastError: msg,
      });
      return { ok: false, state, message: msg };
    }
  }

  async verifyToken(token: string, expected: { machineIdHash: string; instanceId: string }): Promise<{ payload: JWTPayload }> {
    const key = await this.getPublicKey();
    if (!key) {
      throw new Error('LICENSE_PUBLIC_KEY_PEM no configurada (pin requerido para verificación RS256)');
    }
    const skew = this.getClockSkewSec();
    const { payload } = await jwtVerify(token, key, { algorithms: ['RS256'], clockTolerance: skew });
    // Validar claims mínimos
    const sub = payload.sub as string | undefined;
    const inst = (payload['instance_id'] || payload['instanceId']) as string | undefined;
    if (sub && sub !== expected.machineIdHash) {
      throw new Error('Token sub no coincide con machine_id_hash local');
    }
    if (inst && inst !== expected.instanceId) {
      throw new Error('Token instance_id no coincide con instancia local');
    }
    return { payload };
  }

  detectClockTamper(now: Date, serverTime: Date, lastServerTime?: Date | null): boolean {
    const skewMs = this.getClockSkewSec() * 1000;
    if (now.getTime() < serverTime.getTime() - skewMs) return true;
    if (lastServerTime && serverTime.getTime() < new Date(lastServerTime).getTime() - skewMs) return true;
    return false;
  }

  parseDate(v: any): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  claimDate(payload: JWTPayload, key: string): Date | null {
    const v = payload[key];
    if (v == null) return null;
    if (typeof v === 'number') return new Date(v * 1000);
    return this.parseDate(v);
  }

  async evaluateAccess(): Promise<{ allowed: boolean; blocked: boolean; reason: string | null; state: AppLicensingState }> {
    const mode = this.getEnforcementMode();
    const state = await this.stateService.getState();
    if (mode === 'off') return { allowed: true, blocked: false, reason: null, state };

    const now = new Date();
    const status = (state.licenseStatus || '').toUpperCase();
    const validUntil = state.validUntil ? new Date(state.validUntil) : null;
    const graceDeadline = state.graceDeadlineAt ? new Date(state.graceDeadlineAt) : null;
    const skewMs = this.getClockSkewSec() * 1000;
    const hasToken = !!state.lastTokenJws;

    // intentar revalidar token cacheado para claims básicos (firma ya verificada en último OK; si pin cambia no re-verificamos acá para no bloquear por config drift, pero confiamos en cache si fue válido)
    let cachedOk = false;
    if (hasToken) {
      try {
        // verificación ligera: si tenemos key, validamos firma/exp; si no, usamos metadatos persistidos
        const key = await this.getPublicKey();
        if (key) {
          const { payload } = await jwtVerify(state.lastTokenJws!, key, { algorithms: ['RS256'], clockTolerance: this.getClockSkewSec() });
          const exp = payload.exp ? new Date(payload.exp * 1000) : validUntil;
          cachedOk = !!exp && exp.getTime() + skewMs >= now.getTime();
        } else {
          // sin key no podemos verificar criptográficamente; solo usamos estado persistido de última verificación exitosa
          cachedOk = !!validUntil && validUntil.getTime() + skewMs >= now.getTime();
        }
      } catch {
        cachedOk = false;
      }
    }

    const withinValidity = !!validUntil && validUntil.getTime() + skewMs >= now.getTime();
    const withinGrace = !!graceDeadline && !state.clockTamperSuspected && graceDeadline.getTime() + skewMs >= now.getTime();
    const activeOrCached = status === 'ACTIVE' || status === 'GRACE' || cachedOk || withinValidity;

    if (activeOrCached || (withinGrace && (hasToken || state.lastSuccessfulCheckAt))) {
      if (mode === 'warn' && !activeOrCached && withinGrace) {
        return { allowed: true, blocked: false, reason: 'Licencia en gracia (warn)', state };
      }
      return { allowed: true, blocked: false, reason: withinValidity || activeOrCached ? null : 'Licencia en gracia (caché)', state };
    }

    // sin validez ni gracia
    if (mode === 'warn') {
      return { allowed: true, blocked: false, reason: 'Licencia inválida/expirada (warn)', state };
    }
    // grace|strict -> fail-closed
    const reason = state.clockTamperSuspected
      ? 'Bloqueado: posible manipulación de reloj sin licencia vigente'
      : 'Bloqueado: licencia inválida o gracia expirada';
    return { allowed: false, blocked: true, reason, state };
  }

  async getStatusView(): Promise<LicenseStatusView> {
    const state = await this.stateService.getState();
    const access = await this.evaluateAccess();
    return {
      enforcementMode: this.getEnforcementMode(),
      licenseStatus: state.licenseStatus ?? null,
      planCode: state.planCode ?? null,
      validUntil: state.validUntil ? new Date(state.validUntil).toISOString() : null,
      graceDeadlineAt: state.graceDeadlineAt ? new Date(state.graceDeadlineAt).toISOString() : null,
      lastCheckAt: state.lastCheckAt ? new Date(state.lastCheckAt).toISOString() : null,
      lastSuccessfulCheckAt: state.lastSuccessfulCheckAt ? new Date(state.lastSuccessfulCheckAt).toISOString() : null,
      lastServerTime: state.lastServerTime ? new Date(state.lastServerTime).toISOString() : null,
      clockTamperSuspected: !!state.clockTamperSuspected,
      lastError: state.lastError ?? null,
      appVersion: state.appVersion ?? (process.env.APP_VERSION || null),
      instanceId: state.instanceId ?? null,
      machineIdHash: state.machineIdHash ?? null,
      fingerprintHash: state.fingerprintHash ?? null,
      updateAvailableVersion: state.updateAvailableVersion ?? null,
      blocked: access.blocked,
      blockReason: access.reason,
    };
  }
}
