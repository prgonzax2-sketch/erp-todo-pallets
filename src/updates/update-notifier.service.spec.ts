import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { UpdateNotifierService } from './update-notifier.service.js';
import { LicenseStateService } from '../licensing/license-state.service.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

async function signManifest(payload: Record<string, any>, expSec?: number) {
  const pk = await importPKCS8(privatePem, 'RS256');
  let jwt = new SignJWT(payload).setProtectedHeader({ alg: 'RS256' }).setIssuedAt(Math.floor(Date.now() / 1000));
  if (expSec) jwt = jwt.setExpirationTime(expSec);
  return jwt.sign(pk);
}

function makeState(overrides: any = {}) {
  return {
    id: 1,
    updateAvailableVersion: null,
    updateManifestMeta: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('UpdateNotifierService (F2.8)', () => {
  let state: any;
  let licenseState: any;
  let service: UpdateNotifierService;
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T12:00:00.000Z'));
    state = makeState();
    licenseState = {
      getState: vi.fn(async () => state),
      updateState: vi.fn(async (patch: any) => {
        state = { ...state, ...patch, updatedAt: new Date() };
        return state;
      }),
    };
    process.env.LICENSE_PUBLIC_KEY_PEM = publicPem;
    process.env.LICENSE_SERVER_URL = 'https://auth.example.test';
    process.env.APP_VERSION = '1.0.0';
    process.env.UPDATE_CHANNEL = 'stable';
    process.env.LICENSE_CLOCK_SKEW_SEC = '300';
    service = new UpdateNotifierService(licenseState as LicenseStateService);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...origEnv };
  });

  it('verifica manifiesto JWS firmado y marca update disponible', async () => {
    const manifest = {
      version: '1.1.0',
      channel: 'stable',
      image_ref: 'ghcr.io/org/erp@sha256:abc',
      image_digest_sha256: 'sha256:abc',
      migration_bundle_hash: 'm1',
      compose_hash: 'c1',
      mandatory: false,
      min_supported_version: '1.0.0',
      published_at: new Date().toISOString(),
    };
    const jws = await signManifest(manifest, Math.floor(Date.now() / 1000) + 3600);
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ manifest: jws, version: '1.1.0', channel: 'stable' }) });

    const res = await service.checkForUpdate();
    expect(res.ok).toBe(true);
    expect(res.updateAvailable).toBe(true);
    expect(res.latest).toBe('1.1.0');
    expect(state.updateAvailableVersion).toBe('1.1.0');
    expect(state.updateManifestMeta?.image_ref).toBe('ghcr.io/org/erp@sha256:abc');
    expect(state.updateManifestMeta?.image_digest_sha256).toBe('sha256:abc');
  });

  it('rechaza manifiesto sin JWS verificable cuando hay llave configurada', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ manifest: { version: '1.1.0' }, version: '1.1.0' }) });
    const res = await service.checkForUpdate();
    expect(res.ok).toBe(false);
    expect(res.updateAvailable).toBe(false);
    expect(String(res.message || '')).toMatch(/JWS|firmado|verific/i);
  });

  it('rechaza manifiesto firmado con otra llave', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherPrivPem = other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const pk = await importPKCS8(otherPrivPem, 'RS256');
    const jws = await new SignJWT({ version: '1.1.0', channel: 'stable' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(pk);
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ manifest: jws }) });
    const res = await service.checkForUpdate();
    expect(res.ok).toBe(false);
    expect(res.updateAvailable).toBe(false);
  });

  it('getStatus refleja estado persistido y metadata', async () => {
    state = makeState({ updateAvailableVersion: '1.1.0', updateManifestMeta: { latest: '1.1.0', channel: 'stable' } });
    licenseState.getState.mockImplementation(async () => state);
    const status = await service.getStatus();
    expect(status.currentVersion).toBe('1.0.0');
    expect(status.updateAvailable).toBe(true);
    expect(status.availableVersion).toBe('1.1.0');
  });
});
