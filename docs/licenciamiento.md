# Licenciamiento y actualizaciones on-prem — Cliente ERP (Pilar 2)

> Preparación F5 (2026-11-11). **Sin claves privadas.** Piloto: `LICENSE_ENFORCEMENT=grace`, `UPDATES_AUTO_ENABLED=false` (no auto-update estricto).

## Servidor de licencias (producción)
- **URL:** `LICENSE_SERVER_URL=https://licencias.example.com` (ajustar si la URL pública definitiva difiere).
- **Verificación:** tokens/manifiestos JWS **RS256** validados con clave pública pinneada (Pilar 1).

## Clave pública RSA productiva pinneada
Configurar `LICENSE_PUBLIC_KEY_PEM` en `.env` (PEM con saltos de línea escapados `\n`). Clave pública segura para distribuir; debe corresponder a la expuesta por el Pilar 1 en `/.well-known/license-jwks.json` (`kid` activo, p. ej. `prod-20261111`).

```env
LICENSE_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA/haJWv8Qy5YJwT/gZKrB\nVJ2snwn1y3xoRoRz6QQu2sRuT5S/8lag8cm6OjfiOUTi/pXGyPv8hNYiPuEbI50v\na3kUovqOgWJbXo0HNX6dcphm41Z5p4pG9V8ZxFg383ju7NpgxL2QH5n+iTkr2fNp\n5iNepo26P6vDjW8G/0hwzH7X+AbD3/rlfOMUqXj3BosfSqtmBh7S7w3R1nt3dxHo\nJijaJ2jg9TprP+TSrr+bRqQFa+jlSW4ybUHikC3vDhCDDL6Vf8oa6rzW3TMxV9IO\nGN9MpLgAJNf4xIJmzLZf0HJ7WzE6sLKX3Oocd2VX3e4RlV3zjSdL/mtN/bgo48tp\nIbWsp2bBqA2XGfvpRSDDHGslIbbfvDI1g65nf8dOHmxsyGokCOE4AlpuBSo2BjUk\nLI/ioy81C5eSYuN+zUbsGwzxzcf4AEU59upMZ6lFCcADutTCjk3pNSxQ9NSMCFve\nqMTnos6BrGKmMzVGYUR7EHof+hP5IsrzmzeQEwoEYm8ATdyjzPRgJBH37dqecrSz\nqhiN7pJH4qd0h4Zdb8JbwDv8wRk8QIv+eHK+7zZTr/er77VMDZ9Wj9E910KMM8VD\nXSTd7UQ9HfycIyZwvZtBGBGmzdC0Q/cD7U8pYO13FW4M/3l/lDeKCtEkNf4ovU3S\n18uNU/XDvuX9kJQAlwNDRAMCAwEAAQ==\n-----END PUBLIC KEY-----"
```

## Configuración de piloto (obligatoria, F5)
- `LICENSE_ENFORCEMENT=grace` (no `strict`).
- `UPDATES_AUTO_ENABLED=false` (**no habilitar auto-update estricto**).
- `UPDATE_CHANNEL=stable`, intervalos/gracia según `.env.example`.

## Instalación (Windows, un solo clic)
- **Método soportado:** instalador `setup.exe` (Inno Setup) proporcionado al cliente. Empaqueta `deploy/docker-compose.prod.yml`, `.env.example` y `deploy/windows-installer/bootstrap.ps1`; el bootstrap (oculto) verifica Docker activo, crea `dbdata/`, `backups/`, `license/`, genera `.env` con credenciales seguras si falta y ejecuta `docker compose -f docker-compose.prod.yml up -d`. Crea acceso directo **"Sistema Aserradero ERP"** a `http://localhost:3000`.
- **Deprecado/eliminado:** instalación manual por consola (`deploy/install.sh`, `deploy/install.bat`).
- Guía de empaquetado/compilación: `docs/windows-packaging.md`.

## Hardening base (despliegue)
- **DB aislada:** `deploy/docker-compose.prod.yml` sin `ports` en `db`, red interna `internal`, `no-new-privileges`.
- **Volúmenes sensibles:** `./license` (identidad/estado D4) y `./backups` con permisos restringidos (bootstrap del instalador + `Dockerfile` crea dirs con `chmod 700`).
- **Headers:** `helmet` activo en `src/main.ts` (CSP deshabilitada por SPA inline; resto de protecciones por defecto). TLS/CORS/rate-limits finos y alertas se gestionan en infraestructura/proxy/operación.

## Referencias
- SDD: `specs/licenciamiento-actualizaciones-onprem/{spec,plan,tasks}.md`
- Runbooks: `docs/runbooks/update-recovery.md`, `docs/migrations.md`
- Instalación/empaquetado: `docs/windows-packaging.md`, `deploy/windows-installer/setup.iss`, `deploy/windows-installer/bootstrap.ps1`, `deploy/docker-compose.prod.yml`
