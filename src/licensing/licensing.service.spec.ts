import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT, exportSPKI, importPKCS8 } from 'jose';
import { LicensingService } from './licensing.service.js';
import { LicenseStateService } from './license-state.service.js';
import { MachineIdService } from './machine-id.service.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

async function signToken(payload: Record<string, any>, opts?: { expSec?: number; nbfSec?: number; iatSec?: number }) {
  const pk = await importPKCS8(privatePem, 'RS256');
  let jwt = new SignJWT(payload).setProtectedHeader({ alg: 'RS256' });
  const now = Math.floor(Date.now() / 1000);
  if (opts?.iatSec != null) jwt = jwt.setIssuedAt(opts.iatSec);
  else jwt = jwt.setIssuedAt(now);
  if (opts?.nbfSec != null) jwt = jwt.setNotBefore(opts.nbfSec);
  if (opts?.expSec != null) jwt = jwt.setExpirationTime(opts.expSec);
  return jwt.sign(pk);
}

function makeState(overrides: any = {}) {
  return {
    id: 1,
    instanceId: 'inst-1',
    machineIdHash: 'machine-hash',
    fingerprintHash: 'fp-hash',
    licenseStatus: null,
    planCode: null,
    validUntil: null,
    graceDeadlineAt: null,
    lastCheckAt: null,
    lastSuccessfulCheckAt: null,
    lastServerTime: null,
    lastTokenJws: null,
    lastError: null,
    clockTamperSuspected: false,
    enforcementMode: null,
    appVersion: null,
    updateAvailableVersion: null,
    updateManifestMeta: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('LicensingService (F2.8)', () => {
  let state: any;
  let stateService: any;
  let machineIdService: any;
  let service: LicensingService;
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T12:00:00.000Z'));
    state = makeState();
    stateService = {
      getState: vi.fn(async () => state),
      updateState: vi.fn(async (patch: any) => {
        state = { ...state, ...patch, updatedAt: new Date() };
        return state;
      }),
    };
    machineIdService = {
      getInstanceId: vi.fn(async () => 'inst-1'),
      getMachineIdHash: vi.fn(async () => 'machine-hash'),
      getFingerprintHash: vi.fn(async () => 'fp-hash'),
    };
    process.env.LICENSE_PUBLIC_KEY_PEM = publicPem;
    process.env.LICENSE_SERVER_URL = 'https://auth.example.test';
    process.env.APP_VERSION = '1.2.3';
    process.env.LICENSE_ENFORCEMENT = 'grace';
    process.env.LICENSE_GRACE_HOURS = '72';
    process.env.LICENSE_CLOCK_SKEW_SEC = '300';
    service = new LicensingService(stateService as LicenseStateService, machineIdService as MachineIdService);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...origEnv };
  });

  it('verifica firma y claims RS256, calcula gracia 72h y cachea estado (ACTIVE)', async () => {
    const expSec = Math.floor(Date.now() / 1000) + 3600;
    const token = await signToken({
      sub: 'machine-hash',
      instance_id: 'inst-1',
      license_status: 'ACTIVE',
      plan: 'pro',
      valid_until: new Date(expSec * 1000).toISOString(),
      grace_hours: 72,
      server_time: new Date().toISOString(),
      jti: 'j1',
    }, { expSec });
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ token, server_time: new Date().toISOString(), status: 'ACTIVE' }) });

    const res = await service.verifyNow('manual');
    expect(res.ok).toBe(true);
    expect(state.licenseStatus).toBe('ACTIVE');
    expect(state.planCode).toBe('pro');
    expect(state.lastTokenJws).toBe(token);
    expect(state.lastError).toBeNull();
    expect(state.graceDeadlineAt).toBeInstanceOf(Date);
    const expectedGrace = new Date(new Date(expSec * 1000).getTime() + 72 * 3600_000).getTime();
    expect(new Date(state.graceDeadlineAt).getTime()).toBe(expectedGrace);
    expect(state.clockTamperSuspected).toBe(false);
  });

  it('rechaza token con claims no coincidentes (sub/instance_id)', async () => {
    const expSec = Math.floor(Date.now() / 1000) + 3600;
    const badSub = await signToken({ sub: 'other', instance_id: 'inst-1', license_status: 'ACTIVE' }, { expSec });
    await expect(service.verifyAndDecodeSignedToken(badSub, { machineIdHash: 'machine-hash', instanceId: 'inst-1' }, 'verify')).rejects.toThrow(/sub|Hardware ID|instalación/i);

    const badInst = await signToken({ sub: 'machine-hash', instance_id: 'other', license_status: 'ACTIVE' }, { expSec });
    await expect(service.verifyAndDecodeSignedToken(badInst, { machineIdHash: 'machine-hash', instanceId: 'inst-1' }, 'verify')).rejects.toThrow(/instance_id|instancia|instalación/i);
  });

  it('token expirado: verifyNow falla y evaluateAccess bloquea en grace/strict (fail-closed) tras gracia agotada', async () => {
    const expSec = Math.floor(Date.now() / 1000) - 3600; // expirado hace 1h
    const token = await signToken({ sub: 'machine-hash', instance_id: 'inst-1', license_status: 'ACTIVE', grace_hours: 72 }, { expSec });
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ token, server_time: new Date().toISOString() }) });

    const res = await service.verifyNow('manual');
    expect(res.ok).toBe(false);
    expect(String(state.lastError || '')).toMatch(/exp|expired|JWT|token|signature|claim/i);

    // simular estado persistido ya expirado y gracia vencida
    const validUntil = new Date('2026-11-01T00:00:00.000Z');
    state = makeState({
      licenseStatus: 'EXPIRED',
      lastTokenJws: 'cached',
      validUntil,
      graceDeadlineAt: new Date(validUntil.getTime() + 72 * 3600_000), // 2026-11-04
      lastSuccessfulCheckAt: validUntil,
      clockTamperSuspected: false,
    });
    stateService.getState.mockImplementation(async () => state);

    process.env.LICENSE_ENFORCEMENT = 'grace';
    const g = await service.evaluateAccess();
    expect(g.allowed).toBe(false);
    expect(g.blocked).toBe(true);

    process.env.LICENSE_ENFORCEMENT = 'strict';
    const s = await service.evaluateAccess();
    expect(s.allowed).toBe(false);
    expect(s.blocked).toBe(true);

    process.env.LICENSE_ENFORCEMENT = 'warn';
    const w = await service.evaluateAccess();
    expect(w.allowed).toBe(true);
    expect(w.blocked).toBe(false);
  });

  it('gracia 72h: permite dentro de gracia en grace mode y bloquea al vencer', async () => {
    process.env.LICENSE_ENFORCEMENT = 'grace';
    const validUntil = new Date('2026-11-10T12:00:00.000Z'); // venció ayer
    state = makeState({
      licenseStatus: 'EXPIRED',
      validUntil,
      graceDeadlineAt: new Date(validUntil.getTime() + 72 * 3600_000), // 2026-11-13T12:00Z > now(11)
      lastSuccessfulCheckAt: new Date('2026-11-10T12:00:00.000Z'),
      lastTokenJws: null,
      clockTamperSuspected: false,
    });
    stateService.getState.mockImplementation(async () => state);
    const allowed = await service.evaluateAccess();
    expect(allowed.allowed).toBe(true);

    // avanzar más allá de gracia
    vi.setSystemTime(new Date('2026-11-14T00:00:00.000Z'));
    const blocked = await service.evaluateAccess();
    expect(blocked.allowed).toBe(false);
    expect(blocked.blocked).toBe(true);
  });

  it('clock-rollback: detecta tamper y no extiende gracia en enforcement grace/strict', async () => {
    const expSec = Math.floor(Date.now() / 1000) + 3600;
    const token = await signToken({ sub: 'machine-hash', instance_id: 'inst-1', license_status: 'ACTIVE' }, { expSec });
    // lastServerTime futuro respecto al server_time actual => rollback/tamper por detectClockTamper
    state = makeState({ lastServerTime: new Date('2026-11-12T12:00:00.000Z'), clockTamperSuspected: false });
    stateService.getState.mockImplementation(async () => state);
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ token, server_time: '2026-11-11T12:00:00.000Z' }) });

    const res = await service.verifyNow('manual');
    expect(res.ok).toBe(true);
    expect(state.clockTamperSuspected).toBe(true);

    // dentro de ventana de gracia temporal pero con tamper -> no debe permitir en grace/strict
    process.env.LICENSE_ENFORCEMENT = 'grace';
    state = makeState({
      licenseStatus: 'EXPIRED',
      validUntil: new Date('2026-11-10T12:00:00.000Z'),
      graceDeadlineAt: new Date('2026-11-13T12:00:00.000Z'),
      lastSuccessfulCheckAt: new Date('2026-11-10T12:00:00.000Z'),
      lastTokenJws: 'cached',
      clockTamperSuspected: true,
    });
    stateService.getState.mockImplementation(async () => state);
    const access = await service.evaluateAccess();
    expect(access.allowed).toBe(false);
    expect(access.blocked).toBe(true);
    expect(String(access.reason || '')).toMatch(/reloj|clock/i);
  });

  it('evaluateAccess respeta modos off/warn/grace/strict', async () => {
    state = makeState({ licenseStatus: 'EXPIRED', validUntil: new Date('2026-10-01T00:00:00Z'), graceDeadlineAt: new Date('2026-10-02T00:00:00Z'), clockTamperSuspected: false });
    stateService.getState.mockImplementation(async () => state);

    process.env.LICENSE_ENFORCEMENT = 'off';
    expect((await service.evaluateAccess()).allowed).toBe(true);
    process.env.LICENSE_ENFORCEMENT = 'warn';
    expect((await service.evaluateAccess()).allowed).toBe(true);
    process.env.LICENSE_ENFORCEMENT = 'grace';
    expect((await service.evaluateAccess()).allowed).toBe(false);
    process.env.LICENSE_ENFORCEMENT = 'strict';
    expect((await service.evaluateAccess()).allowed).toBe(false);
  });

  it('detecta rollback por reloj local adelantado respecto a server_time (skew)', () => {
    const now = new Date('2026-11-10T12:00:00.000Z'); // local atrás
    const serverTime = new Date('2026-11-11T12:00:00.000Z'); // server muy adelante
    expect(service.detectClockTamper(now, serverTime, null)).toBe(true);
  });

  describe('activateWithToken / getActivationStatusView (activación offline por JWS)', () => {
    it('activa correctamente con JWS válido+biding, persiste estado y expone IDs/días restantes', async () => {
      const validUntilIso = '2026-12-11T12:00:00.000Z';
      const token = await signToken(
        {
          sub: 'machine-hash',
          instance_id: 'inst-1',
          license_status: 'ACTIVE',
          plan: 'enterprise',
          valid_from: '2026-11-01T00:00:00.000Z',
          valid_until: validUntilIso,
          grace_hours: 72,
          iat: Math.floor(Date.now() / 1000),
          server_time: '2026-11-11T12:00:00.000Z',
          jti: 'act-1',
        },
        { expSec: Math.floor(new Date(validUntilIso).getTime() / 1000) },
      );

      const res = await service.activateWithToken(token);
      expect(res.ok).toBe(true);
      expect(res.message).toMatch(/activada correctamente/i);
      expect(state.licenseStatus).toBe('ACTIVE');
      expect(state.planCode).toBe('enterprise');
      expect(state.lastTokenJws).toBe(token);
      expect(state.lastError).toBeNull();
      expect(state.lastSuccessfulCheckAt).toBeInstanceOf(Date);
      expect(new Date(state.validUntil).toISOString()).toBe(validUntilIso);
      expect(new Date(state.graceDeadlineAt).toISOString()).toBe(new Date(new Date(validUntilIso).getTime() + 72 * 3600_000).toISOString());

      const view = await service.getActivationStatusView();
      expect(view.blocked).toBe(false);
      expect(view.machineIdHash).toBe('machine-hash');
      expect(view.instanceId).toBe('inst-1');
      expect(view.daysRemaining).toBe(30);
      expect(view.validFrom).toBe('2026-11-01T00:00:00.000Z');
      expect(view.planCode).toBe('enterprise');
    });

    it('rechaza mismatch de Hardware ID (sub) y de instance_id con mensajes sanitizados', async () => {
      const base = {
        license_status: 'ACTIVE',
        valid_until: '2026-12-11T12:00:00.000Z',
        grace_hours: 72,
      };
      const badSub = await signToken({ ...base, sub: 'other', instance_id: 'inst-1' }, { expSec: Math.floor(Date.now() / 1000) + 3600 });
      const r1 = await service.activateWithToken(badSub);
      expect(r1.ok).toBe(false);
      expect(r1.message).toMatch(/Hardware ID no coincide/i);
      expect(state.lastError).toMatch(/Hardware ID no coincide/i);

      const badInst = await signToken({ ...base, sub: 'machine-hash', instance_id: 'other' }, { expSec: Math.floor(Date.now() / 1000) + 3600 });
      const r2 = await service.activateWithToken(badInst);
      expect(r2.ok).toBe(false);
      expect(r2.message).toMatch(/ID de instancia no coincide/i);
    });

    it('rechaza firma inválida/mal formada (sin depender de verificación online)', async () => {
      (fetch as any).mockRejectedValue(new Error('offline'));
      const r1 = await service.activateWithToken('not.a.jwt');
      expect(r1.ok).toBe(false);
      expect(r1.message).toMatch(/firma inválida|formato incorrecto/i);
      expect(fetch).not.toHaveBeenCalled();

      const { privateKey: otherPriv } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const otherPem = otherPriv.export({ type: 'pkcs8', format: 'pem' }).toString();
      const pk = await importPKCS8(otherPem, 'RS256');
      const forged = await new SignJWT({ sub: 'machine-hash', instance_id: 'inst-1', license_status: 'ACTIVE', valid_until: '2026-12-11T12:00:00.000Z' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000))
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(pk);
      const r2 = await service.activateWithToken(forged);
      expect(r2.ok).toBe(false);
      expect(r2.message).toMatch(/firma inválida|formato incorrecto/i);
    });

    it('acepta criptográficamente pero deja bloqueado si estado es REVOKED o SUSPENDED', async () => {
      const revoked = await signToken(
        { sub: 'machine-hash', instance_id: 'inst-1', license_status: 'REVOKED', valid_until: '2026-12-11T12:00:00.000Z', grace_hours: 72 },
        { expSec: Math.floor(new Date('2026-12-11T12:00:00.000Z').getTime() / 1000) },
      );
      const r1 = await service.activateWithToken(revoked);
      expect(r1.ok).toBe(false);
      expect(r1.status.blocked).toBe(true);
      expect(r1.status.licenseStatus).toBe('REVOKED');
      expect(String(r1.status.blockReason || r1.message)).toMatch(/revocad/i);

      const suspended = await signToken(
        { sub: 'machine-hash', instance_id: 'inst-1', license_status: 'SUSPENDED', valid_until: '2026-12-11T12:00:00.000Z', grace_hours: 72 },
        { expSec: Math.floor(new Date('2026-12-11T12:00:00.000Z').getTime() / 1000) },
      );
      const r2 = await service.activateWithToken(suspended);
      expect(r2.ok).toBe(false);
      expect(r2.status.blocked).toBe(true);
      expect(String(r2.status.blockReason || r2.message)).toMatch(/suspendid/i);
    });

    it('token expirado/vencido sin gracia deja bloqueado; token vacío se rechaza', async () => {
      const rEmpty = await service.activateWithToken('   ');
      expect(rEmpty.ok).toBe(false);
      expect(rEmpty.message).toMatch(/pegar una licencia|licencia válida/i);

      // expirado hace tiempo (exp y valid_until pasados, sin gracia)
      const past = '2026-10-01T00:00:00.000Z';
      const expired = await signToken(
        { sub: 'machine-hash', instance_id: 'inst-1', license_status: 'ACTIVE', valid_until: past, grace_hours: 0 },
        { expSec: Math.floor(new Date(past).getTime() / 1000) },
      );
      const r = await service.activateWithToken(expired);
      expect(r.ok).toBe(false);
      expect(String(r.message)).toMatch(/expir|vencid|fecha|vigenc/i);
    });

    it('acepta en activación token con exp JWS corto si valid_until+gracia siguen vigentes (contrato issue-token)', async () => {
      const validUntilIso = '2026-12-11T12:00:00.000Z';
      const shortExp = Math.floor(Date.now() / 1000) - 60; // exp JWS ya vencido
      const token = await signToken(
        {
          sub: 'machine-hash',
          instance_id: 'inst-1',
          license_status: 'ACTIVE',
          plan: 'pro',
          valid_until: validUntilIso,
          grace_hours: 72,
          iat: Math.floor(Date.now() / 1000) - 7200,
        },
        { expSec: shortExp },
      );

      const res = await service.activateWithToken(token);
      expect(res.ok).toBe(true);
      expect(res.status.blocked).toBe(false);
      expect(state.licenseStatus).toBe('ACTIVE');
      expect(new Date(state.validUntil).toISOString()).toBe(validUntilIso);
    });

    it('getActivationStatusView deriva IDs desde machineIdService cuando faltan y calcula daysRemaining', async () => {
      state = makeState({
        instanceId: null,
        machineIdHash: null,
        licenseStatus: 'ACTIVE',
        validUntil: new Date('2026-11-21T12:00:00.000Z'),
        graceDeadlineAt: new Date('2026-11-24T12:00:00.000Z'),
        lastTokenJws: null,
      });
      stateService.getState.mockImplementation(async () => state);

      const view = await service.getActivationStatusView();
      expect(view.machineIdHash).toBe('machine-hash');
      expect(view.instanceId).toBe('inst-1');
      expect(view.daysRemaining).toBe(10);
      expect(view.blocked).toBe(false);
      expect(view.lastError).toBeNull();
    });
  });
});
