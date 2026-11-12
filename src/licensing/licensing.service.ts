import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey } from 'node:crypto';
import { compactVerify, importSPKI, JWTPayload } from 'jose';
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

export interface LicenseActivationStatusView {
  enforcementMode: EnforcementMode;
  licenseStatus: string | null;
  planCode: string | null;
  validFrom: string | null;
  validUntil: string | null;
  graceDeadlineAt: string | null;
  daysRemaining: number | null;
  lastCheckAt: string | null;
  lastSuccessfulCheckAt: string | null;
  clockTamperSuspected: boolean;
  lastError: string | null;
  appVersion: string | null;
  machineIdHash: string | null;
  instanceId: string | null;
  blocked: boolean;
  blockReason: string | null;
}

export interface ActivationResult {
  ok: boolean;
  message: string;
  status: LicenseActivationStatusView;
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
    pem = pem.replace(/\\n/g, '\n');
    if (this.cachedKey && this.cachedKeyPem === pem) return this.cachedKey;
    try {
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

  private async getPublicKeyOrThrow(): Promise<CryptoKey> {
    const key = await this.getPublicKey();
    if (!key) {
      throw new Error('LICENSE_PUBLIC_KEY_PEM no configurada (pin requerido para verificación RS256)');
    }
    return key;
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

      const payload = await this.verifyAndDecodeSignedToken(token, { machineIdHash, instanceId }, 'verify');
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

  /**
   * Verifica firma RS256 y decodifica payload. Para tokens de activación (issue-token)
   * acepta exp contractual (valid_until+gracia) aunque el exp JWS sea corto, siempre que
   * firma/binding/claims sean válidos.
   */
  async verifyAndDecodeSignedToken(
    token: string,
    expected: { machineIdHash: string; instanceId: string },
    mode: 'verify' | 'activation',
  ): Promise<JWTPayload> {
    const key = await this.getPublicKeyOrThrow();
    const skewSec = this.getClockSkewSec();
    let payload: JWTPayload;
    try {
      const { payload: p } = await compactVerify(token, key);
      payload = JSON.parse(new TextDecoder().decode(p)) as JWTPayload;
    } catch {
      throw new Error('Firma de licencia inválida o token mal formado');
    }

    this.validateCommonClaims(payload, expected, skewSec);

    const nowSec = Math.floor(Date.now() / 1000);
    const nbf = typeof payload.nbf === 'number' ? payload.nbf : null;
    const exp = typeof payload.exp === 'number' ? payload.exp : null;
    if (nbf != null && nowSec + skewSec < nbf) {
      throw new Error('La licencia aún no es válida (nbf)');
    }

    const validUntil = this.claimDate(payload, 'valid_until') || this.claimDate(payload, 'exp');
    const graceHours = Number(payload['grace_hours'] ?? this.getGraceHoursDefault());
    const graceMs = (Number.isFinite(graceHours) ? graceHours : this.getGraceHoursDefault()) * 3600_000;
    const graceEnd = validUntil ? validUntil.getTime() + graceMs : null;

    if (exp != null && nowSec - skewSec >= exp) {
      // exp JWS vencido: permitir solo en activación si vigencia contractual+gracia sigue vigente
      if (mode === 'activation' && graceEnd != null && Date.now() <= graceEnd + skewSec * 1000) {
        this.logger.warn('Token de activación aceptado con exp JWS corto pero vigencia contractual válida');
      } else {
        throw new Error('La licencia (token) ha expirado');
      }
    }

    if (!validUntil) {
      throw new Error('Token de licencia sin vigencia válida');
    }
    return payload;
  }

  private validateCommonClaims(payload: JWTPayload, expected: { machineIdHash: string; instanceId: string }, skewSec: number) {
    const sub = payload.sub as string | undefined;
    const inst = (payload['instance_id'] || payload['instanceId']) as string | undefined;
    if (sub && sub !== expected.machineIdHash) {
      throw new Error('MISMATCH_HWID: La licencia no corresponde a esta instalación (Hardware ID no coincide)');
    }
    if (inst && inst !== expected.instanceId) {
      throw new Error('MISMATCH_INSTANCE: La licencia no corresponde a esta instalación (ID de instancia no coincide)');
    }
    const iat = typeof payload.iat === 'number' ? payload.iat : null;
    if (iat != null && iat > Math.floor(Date.now() / 1000) + skewSec) {
      throw new Error('Token de licencia con fecha de emisión inválida (iat)');
    }
  }

  async activateWithToken(licenseToken: string): Promise<ActivationResult> {
    const appVersion = process.env.APP_VERSION || '0.0.1';
    const instanceId = await this.machineIdService.getInstanceId();
    const machineIdHash = await this.machineIdService.getMachineIdHash();
    const fingerprintHash = await this.machineIdService.getFingerprintHash();
    const now = new Date();
    const token = (licenseToken || '').trim();
    if (!token) {
      const status = await this.getActivationStatusView();
      return { ok: false, message: 'Debe pegar una licencia válida.', status };
    }

    const basePatch: Partial<AppLicensingState> = {
      instanceId,
      machineIdHash,
      fingerprintHash,
      appVersion,
      enforcementMode: this.getEnforcementMode(),
      lastCheckAt: now,
    };

    try {
      const payload = await this.verifyAndDecodeSignedToken(token, { machineIdHash, instanceId }, 'activation');
      const validUntil = this.claimDate(payload, 'valid_until');
      if (!validUntil) throw new Error('Token de licencia sin vigencia (valid_until)');
      const graceHours = Number(payload['grace_hours'] ?? this.getGraceHoursDefault());
      const graceMs = (Number.isFinite(graceHours) ? graceHours : this.getGraceHoursDefault()) * 3600_000;
      const graceDeadlineAt = new Date(validUntil.getTime() + graceMs);
      const statusClaim = String(payload['license_status'] || payload['status'] || 'ACTIVE').toUpperCase();
      const serverTime = this.claimDate(payload, 'server_time') || this.claimDate(payload, 'iat') || now;

      const current = await this.stateService.getState();
      const clockTamper = this.detectClockTamper(now, serverTime, current.lastServerTime);

      await this.stateService.updateState({
        ...basePatch,
        licenseStatus: statusClaim,
        planCode: (payload['plan'] as string) || (payload['plan_code'] as string) || current.planCode || null,
        validUntil,
        graceDeadlineAt,
        lastSuccessfulCheckAt: now,
        lastServerTime: serverTime,
        lastTokenJws: token,
        lastError: clockTamper ? 'Posible alteración de reloj detectada al activar' : null,
        clockTamperSuspected: clockTamper ? true : current.clockTamperSuspected || false,
      });

      const status = await this.getActivationStatusView();
      const blocked = status.blocked;
      let message = blocked
        ? (status.blockReason || 'Licencia aplicada, pero el sistema permanece bloqueado según su estado/vigencia.')
        : 'Licencia activada correctamente.';
      if (clockTamper && !blocked) message = 'Licencia activada, pero se detectó posible alteración de reloj.';
      return { ok: !blocked, message, status };
    } catch (e) {
      const raw = (e as Error).message || String(e);
      const safe = this.sanitizeActivationError(raw);
      this.logger.warn(`Fallo activación por token: ${safe}`);
      await this.stateService.updateState({
        ...basePatch,
        lastError: safe,
      });
      const status = await this.getActivationStatusView();
      return { ok: false, message: safe, status };
    }
  }

  sanitizeActivationError(msg: string): string {
    if (!msg) return 'No se pudo activar la licencia.';
    if (msg.includes('MISMATCH_HWID')) return 'La licencia no corresponde a esta instalación (Hardware ID no coincide).';
    if (msg.includes('MISMATCH_INSTANCE')) return 'La licencia no corresponde a esta instalación (ID de instancia no coincide).';
    if (msg.includes('LICENSE_PUBLIC_KEY_PEM')) return 'No hay clave pública de licenciamiento configurada en este servidor.';
    if (msg.toLowerCase().includes('firma') || msg.toLowerCase().includes('mal formado')) return 'La licencia no es válida (firma inválida o formato incorrecto).';
    if (msg.toLowerCase().includes('expir') || msg.toLowerCase().includes('nbf')) return 'La licencia no es válida para la fecha/hora actual (expirada o aún no vigente).';
    if (msg.includes('valid_until')) return 'La licencia no contiene una vigencia válida.';
    return msg.length > 180 ? 'No se pudo activar la licencia. Verifique el código e intente nuevamente.' : msg;
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

    const withinValidity = !!validUntil && validUntil.getTime() + skewMs >= now.getTime();
    const withinGrace = !!graceDeadline && !state.clockTamperSuspected && graceDeadline.getTime() + skewMs >= now.getTime();

    // Estados explícitamente bloqueantes por contrato
    const terminalBlocked = status === 'REVOKED' || status === 'SUSPENDED' || status === 'NOT_FOUND';
    if (terminalBlocked) {
      if (mode === 'warn') return { allowed: true, blocked: false, reason: `Licencia en estado ${status} (warn)`, state };
      const reason = status === 'REVOKED' ? 'Bloqueado: licencia revocada.' : status === 'SUSPENDED' ? 'Bloqueado: licencia suspendida.' : 'Bloqueado: licencia no encontrada.';
      return { allowed: false, blocked: true, reason, state };
    }

    if (withinValidity && status !== 'EXPIRED') {
      return { allowed: true, blocked: false, reason: null, state };
    }

    if (withinGrace && (hasToken || state.lastSuccessfulCheckAt)) {
      if (mode === 'warn') return { allowed: true, blocked: false, reason: 'Licencia en gracia (warn)', state };
      return { allowed: true, blocked: false, reason: 'Licencia en período de gracia.', state };
    }

    if (mode === 'warn') {
      const reason = !hasToken && !validUntil ? 'Sin licencia configurada (warn)' : 'Licencia inválida/expirada (warn)';
      return { allowed: true, blocked: false, reason, state };
    }

    const reason = state.clockTamperSuspected
      ? 'Bloqueado: posible manipulación de reloj detectada.'
      : !hasToken && !validUntil
        ? 'Bloqueado: sistema pendiente de activación (sin licencia).'
        : status === 'EXPIRED' || (validUntil && validUntil.getTime() + skewMs < now.getTime())
          ? 'Bloqueado: licencia vencida o período de gracia finalizado.'
          : 'Bloqueado: licencia inválida o no verificable.';
    return { allowed: false, blocked: true, reason, state };
  }

  computeDaysRemaining(validUntil: Date | null, now = new Date()): number | null {
    if (!validUntil) return null;
    const ms = validUntil.getTime() - now.getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }

  async getActivationStatusView(): Promise<LicenseActivationStatusView> {
    const state = await this.stateService.getState();
    const access = await this.evaluateAccess();
    let instanceId = state.instanceId ?? null;
    let machineIdHash = state.machineIdHash ?? null;
    try {
      if (!instanceId) instanceId = await this.machineIdService.getInstanceId();
      if (!machineIdHash) machineIdHash = await this.machineIdService.getMachineIdHash();
    } catch {}
    const validUntil = state.validUntil ? new Date(state.validUntil) : null;
    const graceDeadlineAt = state.graceDeadlineAt ? new Date(state.graceDeadlineAt) : null;
    const derivedValidFrom = this.deriveValidFrom(state);
    return {
      enforcementMode: this.getEnforcementMode(),
      licenseStatus: state.licenseStatus ?? null,
      planCode: state.planCode ?? null,
      validFrom: derivedValidFrom ? derivedValidFrom.toISOString() : null,
      validUntil: validUntil ? validUntil.toISOString() : null,
      graceDeadlineAt: graceDeadlineAt ? graceDeadlineAt.toISOString() : null,
      daysRemaining: this.computeDaysRemaining(validUntil),
      lastCheckAt: state.lastCheckAt ? new Date(state.lastCheckAt).toISOString() : null,
      lastSuccessfulCheckAt: state.lastSuccessfulCheckAt ? new Date(state.lastSuccessfulCheckAt).toISOString() : null,
      clockTamperSuspected: !!state.clockTamperSuspected,
      lastError: this.sanitizePublicError(state.lastError ?? null),
      appVersion: state.appVersion ?? (process.env.APP_VERSION || null),
      machineIdHash,
      instanceId,
      blocked: access.blocked,
      blockReason: access.reason,
    };
  }

  private deriveValidFrom(state: AppLicensingState): Date | null {
    const token = state.lastTokenJws;
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JWTPayload;
      return this.claimDate(payload, 'valid_from') || this.claimDate(payload, 'nbf');
    } catch {
      return null;
    }
  }

  private sanitizePublicError(err: string | null): string | null {
    if (!err) return null;
    if (err.includes('LICENSE_PUBLIC_KEY_PEM')) return 'Configuración de licenciamiento incompleta.';
    if (err.length > 200) return 'Error de verificación de licencia. Contacte a soporte.';
    return err;
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
