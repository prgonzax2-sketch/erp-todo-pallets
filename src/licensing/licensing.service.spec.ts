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
    await expect(service.verifyToken(badSub, { machineIdHash: 'machine-hash', instanceId: 'inst-1' })).rejects.toThrow(/sub/i);

    const badInst = await signToken({ sub: 'machine-hash', instance_id: 'other', license_status: 'ACTIVE' }, { expSec });
    await expect(service.verifyToken(badInst, { machineIdHash: 'machine-hash', instanceId: 'inst-1' })).rejects.toThrow(/instance_id/i);
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
});
