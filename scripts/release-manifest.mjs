#!/usr/bin/env node
/**
 * release-manifest.mjs — Helper F4 (Pilar 3b) para agente de actualización nocturna.
 * Verifica manifiesto JWS RS256 (compact) con LICENSE_PUBLIC_KEY_PEM (node:crypto, sin deps).
 * Modos:
 *   fetch-verify  Consulta /v1/releases/latest, verifica firma y campos; compara APP_VERSION.
 *                 Salida JSON a stdout: {status:"ok"|"noop"|"error", ...}
 *   verify-jws    Verifica JWS provisto (arg 3 o stdin) y emite payload JSON.
 *
 * Env usados (fetch-verify): LICENSE_SERVER_URL, UPDATE_CHANNEL, APP_VERSION,
 *   LICENSE_PUBLIC_KEY_PEM, LICENSE_CLOCK_SKEW_SEC (informativo), HTTP_TIMEOUT_MS (default 15000).
 */
import crypto from 'node:crypto';

function b64urlToBuf(s) {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : s.length % 4 === 1 ? '===' : '';
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function parsePem() {
  let pem = (process.env.LICENSE_PUBLIC_KEY_PEM || '').trim();
  pem = pem.replace(/\\n/g, '\n');
  if (!pem) throw new Error('LICENSE_PUBLIC_KEY_PEM no configurada');
  return pem;
}

function verifyJws(jws, pem) {
  if (typeof jws !== 'string' || !jws.includes('.')) throw new Error('JWS inválido (no es compact JWS)');
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('JWS inválido (partes != 3)');
  const [h, p, s] = parts;
  let header;
  try { header = JSON.parse(b64urlToBuf(h).toString('utf8')); } catch { throw new Error('Header JWS inválido'); }
  if (header.alg !== 'RS256') throw new Error(`Algoritmo no permitido: ${header.alg || 'desconocido'} (se requiere RS256)`);
  let payload;
  try { payload = JSON.parse(b64urlToBuf(p).toString('utf8')); } catch { throw new Error('Payload JWS inválido'); }
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${h}.${p}`);
  verifier.end();
  const key = crypto.createPublicKey(pem);
  const ok = verifier.verify(key, b64urlToBuf(s));
  if (!ok) throw new Error('Firma RS256 inválida');
  // Validación básica de tiempos (nbf/exp) con tolerancia opcional
  const skew = Number(process.env.LICENSE_CLOCK_SKEW_SEC || 300);
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.nbf === 'number' && now + skew < payload.nbf) throw new Error('Manifiesto aún no vigente (nbf)');
  if (typeof payload.exp === 'number' && now - skew >= payload.exp) throw new Error('Manifiesto expirado (exp)');
  return { header, payload };
}

function normalizeVersion(v) {
  return String(v ?? '').trim().replace(/^v/i, '');
}

function cmpSemver(a, b) {
  const pa = normalizeVersion(a).split(/[-+]/)[0].split('.');
  const pb = normalizeVersion(b).split(/[-+]/)[0].split('.');
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] ?? 0);
    const nb = Number(pb[i] ?? 0);
    const ai = Number.isFinite(na) ? na : null;
    const bi = Number.isFinite(nb) ? nb : null;
    if (ai != null && bi != null) {
      if (ai > bi) return 1;
      if (ai < bi) return -1;
    } else {
      const sa = pa[i] ?? '';
      const sb = pb[i] ?? '';
      if (sa > sb) return 1;
      if (sa < sb) return -1;
    }
  }
  // si núcleo igual, pre-release se considera menor que release (simple)
  const preA = normalizeVersion(a).includes('-');
  const preB = normalizeVersion(b).includes('-');
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  return 0;
}

function pickManifestJws(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.manifest === 'string') return data.manifest;
  if (typeof data.manifest_jws === 'string') return data.manifest_jws;
  if (typeof data.jws === 'string') return data.jws;
  if (data.manifest && typeof data.manifest === 'object') {
    if (typeof data.manifest.manifest_jws === 'string') return data.manifest.manifest_jws;
    if (typeof data.manifest.jws === 'string') return data.manifest.jws;
  }
  return null;
}

function pickPlainPayload(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.manifest && typeof data.manifest === 'object' && typeof data.manifest !== 'string') return data.manifest;
  // respuesta ya podría ser payload plano (no esperado si firmado, pero tolerar detección)
  if (data.version || data.image_ref || data.image_digest_sha256) return data;
  return null;
}

function requireFields(payload) {
  const missing = [];
  for (const k of ['version', 'channel']) if (!payload[k]) missing.push(k);
  if (!payload.image_ref) missing.push('image_ref');
  if (!payload.image_digest_sha256) missing.push('image_digest_sha256');
  if (missing.length) throw new Error(`Campos requeridos ausentes en manifiesto: ${missing.join(', ')}`);
  const digest = String(payload.image_digest_sha256).trim();
  if (!/^sha256:[a-fA-F0-9]{64}$/.test(digest) && !/^[a-fA-F0-9]{64}$/.test(digest)) {
    throw new Error(`image_digest_sha256 con formato inválido: ${digest}`);
  }
}

async function fetchLatest() {
  const baseUrl = (process.env.LICENSE_SERVER_URL || '').replace(/\/$/, '');
  const channel = process.env.UPDATE_CHANNEL || 'stable';
  const current = process.env.APP_VERSION || '0.0.1';
  if (!baseUrl) return { status: 'error', reason: 'LICENSE_SERVER_URL no configurado' };
  const pem = parsePem();
  const timeoutMs = Number(process.env.HTTP_TIMEOUT_MS || 15000);
  const url = `${baseUrl}/v1/releases/latest?channel=${encodeURIComponent(channel)}&current=${encodeURIComponent(current)}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000);
  let res, text;
  try {
    res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, signal: ac.signal });
    text = await res.text();
  } catch (e) {
    return { status: 'error', reason: `No se pudo consultar releases/latest: ${e?.name === 'AbortError' ? 'timeout' : (e?.message || e)}` };
  } finally {
    clearTimeout(t);
  }
  if (res.status === 404) return { status: 'noop', reason: 'No hay release disponible (404)', httpStatus: 404 };
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { return { status: 'error', reason: `Respuesta no JSON (HTTP ${res.status})`, httpStatus: res.status }; }
  if (!res.ok) return { status: 'error', reason: `HTTP ${res.status} al consultar releases/latest`, httpStatus: res.status, body: data };

  const jws = pickManifestJws(data);
  let payload;
  let signed = false;
  try {
    if (jws) {
      ({ payload } = verifyJws(jws, pem));
      signed = true;
    } else {
      // con clave configurada, exigir manifiesto firmado
      throw new Error('Manifiesto sin JWS firmado verificable (se rechaza por seguridad)');
    }
  } catch (e) {
    return { status: 'error', reason: `Verificación de manifiesto falló: ${e?.message || e}` };
  }

  try { requireFields(payload); } catch (e) {
    return { status: 'error', reason: e?.message || String(e), payload };
  }

  const latest = String(payload.version);
  if (normalizeVersion(latest) === normalizeVersion(current)) {
    return { status: 'noop', reason: `Sin versión nueva (APP_VERSION=${current}, latest=${latest})`, version: latest, payload, signed };
  }
  // Determinista: endpoint authoritative devolvió release firmado distinto de current => candidato.
  const cmp = cmpSemver(latest, current);
  return {
    status: 'ok',
    reason: cmp > 0 ? 'Nueva versión disponible' : (cmp < 0 ? 'Versión distinta (menor) firmada disponible' : 'Versión distinta disponible'),
    version: latest,
    current,
    channel: payload.channel || channel,
    image_ref: payload.image_ref,
    image_digest_sha256: payload.image_digest_sha256,
    migration_bundle_hash: payload.migration_bundle_hash ?? null,
    compose_hash: payload.compose_hash ?? null,
    mandatory: payload.mandatory ?? null,
    min_supported_version: payload.min_supported_version ?? null,
    published_at: payload.published_at ?? null,
    payload,
    signed,
    semver_cmp: cmp,
  };
}

async function main() {
  const mode = process.argv[2] || 'fetch-verify';
  try {
    if (mode === 'verify-jws') {
      const pem = parsePem();
      let jws = process.argv[3];
      if (!jws) {
        jws = await new Promise((resolve, reject) => {
          let b = ''; process.stdin.setEncoding('utf8');
          process.stdin.on('data', c => b += c);
          process.stdin.on('end', () => resolve(b.trim()));
          process.stdin.on('error', reject);
        });
      }
      const out = verifyJws(jws, pem);
      process.stdout.write(JSON.stringify({ status: 'ok', ...out }));
      return;
    }
    // default: fetch-verify
    const out = await fetchLatest();
    process.stdout.write(JSON.stringify(out));
    process.exitCode = out.status === 'error' ? 2 : 0;
  } catch (e) {
    process.stdout.write(JSON.stringify({ status: 'error', reason: e?.message || String(e) }));
    process.exitCode = 2;
  }
}

main();
