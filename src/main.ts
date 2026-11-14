import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

function readTunnelOriginCached() {
  let cache: { value: string | null; at: number } = { value: null, at: 0 };
  const ttlMs = 5000;
  return () => {
    const now = Date.now();
    if (now - cache.at < ttlMs) return cache.value;
    cache.at = now;
    try {
      const stateDir = process.env.LICENSE_STATE_PATH || './license';
      const raw = readFileSync(join(stateDir, 'tunnel_url.txt'), 'utf8').trim().replace(/\/$/, '');
      if (/^https:\/\//i.test(raw)) {
        const u = new URL(raw);
        cache.value = u.origin;
        return cache.value;
      }
      cache.value = null;
    } catch {
      cache.value = null;
    }
    return cache.value;
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CSP deshabilitada: la SPA (index.html) usa scripts inline y handlers onclick extensivamente;
  // la CSP por defecto de helmet bloquea su ejecución y rompe el login/UI.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // CORS: permite orígenes configurados (CORS_ORIGINS) y el origen público del túnel activo (si existe).
  // Por defecto se restringen orígenes cruzados no autorizados; same-origin/no-origin permitidos.
  const staticCorsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const getTunnelOrigin = readTunnelOriginCached();
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      if (staticCorsOrigins.includes(normalized)) return callback(null, true);
      const tunnelOrigin = getTunnelOrigin();
      if (tunnelOrigin && normalized === tunnelOrigin) return callback(null, true);
      // Si no hay orígenes estáticos configurados, mantener comportamiento restrictivo para orígenes cruzados no autorizados.
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use((request: Request, response: Response, next: NextFunction) => {
    const spaEntry = request.method === 'GET' && (request.path === '/' || request.path === '/activacion' || request.path === '/setup');
    if (spaEntry) {
      response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      response.setHeader('Pragma', 'no-cache');
      response.setHeader('Expires', '0');
      return response.sendFile(join(process.cwd(), 'index.html'));
    }
    if (request.method === 'GET' && request.path === '/styles.css') {
      response.setHeader('Content-Type', 'text/css; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache');
      return response.sendFile(join(process.cwd(), 'styles.css'));
    }

    next();
  });

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
bootstrap();
