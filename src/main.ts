import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CSP deshabilitada: la SPA (index.html) usa scripts inline y handlers onclick extensivamente;
  // la CSP por defecto de helmet bloquea su ejecución y rompe el login/UI.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // CORS restringido: por defecto denegado para orígenes cruzados (same-origin no requiere CORS).
  // Configurar CORS_ORIGINS (separados por coma) solo si frontend corre en otro origen.
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors(
    corsOrigins.length
      ? {
          origin: corsOrigins,
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
          exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
        }
      : {
          origin: false,
          exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
        },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use((request: Request, response: Response, next: NextFunction) => {
    const spaEntry = request.method === 'GET' && (request.path === '/' || request.path === '/activacion');
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
