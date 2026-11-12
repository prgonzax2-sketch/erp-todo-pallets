# Licenciamiento y actualizaciones on-prem — Cliente ERP (Pilar 2)

> Estado: cliente con verificación online (D2), **activación manual offline por pegado de token JWS** (Pilar 1 `issue-token`) y UI de bloqueo/renovación implementada en `index.html` + `src/licensing/*` (2026-11-12). **Sin claves privadas.** Piloto: `LICENSE_ENFORCEMENT=grace`, `UPDATES_AUTO_ENABLED=false`.

## Identidad de instalación (D4)
- **`instance_id`**: UUID persistente en `${LICENSE_STATE_PATH:-./license}/instance.key` (ancla primaria).
- **`machine_id_hash` (Hardware ID / Machine ID)**: `sha256("instance:"+instanceId)`, derivado determinístico del `instance_id`. **Este es el código que debe coincidir byte a byte con `sub` del token de licencia y el que se registra en el servidor central.**
- La UI `/activacion` y “Mi Suscripción” muestran y permiten copiar **ambos** códigos etiquetados: `machine_id_hash` e `instance_id`.

## Activación por token (offline, pegado manual)
- El proveedor emite un JWS **RS256** (Pilar 1, p. ej. `POST /v1/admin/licenses/:id/issue-token`) firmado con la clave privada central. El ERP **solo** usa la clave pública pinneada (`LICENSE_PUBLIC_KEY_PEM`) para verificar firma.
- **Binding estricto:** `sub == machine_id_hash` e `instance_id == instance_id` (comparación exacta). Mismatch → activación rechazada con motivo claro (Hardware ID / instancia no coincide).
- **Claims/vigencia:** se validan claims contractuales (p. ej. `iss,sub,instance_id,license_status,plan,valid_from,valid_until,grace_hours,nbf,iat,jti,exp`, `server_time` si aplica). El acceso se rige por `valid_until` + `grace_hours` + `license_status` + reloj/anti-rollback/enforcement.
- **`exp` JWS corto vs vigencia contractual:** en **activación** se acepta defensivamente un `exp` JWS ya vencido solo si firma+binding son válidos y la vigencia contractual (`valid_until` + gracia, con skew) sigue vigente (caso `exp=max(endsAt+grace, now+1h)`/diagnóstico). En verificación online se exige `exp` válido. Siempre se requiere `valid_until` válido.
- **Estados no activos:** tokens firmados con estado `REVOKED`/`SUSPENDED`/expirado se aceptan criptográficamente pero el sistema queda **bloqueado** con motivo acorde; `NOT_FOUND`/sin licencia/vencida sin gracia bloquean según modo.
- **Sin red requerida** para activar: no se llama al central al pegar el token; la verificación online periódica (`verifyNow`) sigue siendo independiente cuando `LICENSE_SERVER_URL` está configurado.

## UI y enforcement
- **Bloqueo obligatorio:** si no hay licencia, está vencida/bloqueada o hay mismatch/reloj alterado según política, el ERP fuerza redirección/estado en `/activacion` y oculta la SPA operativa; la navegación ERP queda deshabilitada (`cambiarVista` + guardia FE, `LicenseGuard` backend).
- **`/activacion` (pública, SPA servida por backend):** “Sistema Bloqueado / Pendiente de Activación”, muestra `machine_id_hash` e `instance_id` (copiables), motivo/estado/vigencia, textarea para pegar licencia (JWS) y botón “Activar Sistema” (`POST /licensing/activate-token`).
- **“Mi Suscripción” (licencia activa/no bloqueada):** vista/menú en la app con Estado, Plan, Fecha de vencimiento, Días restantes, Fin de gracia, Última verificación, códigos de instalación y formulario para ingresar nueva licencia (renovación).
- **Endpoints públicos (sin JWT):** `GET /licensing/activation-status`, `POST /licensing/activate-token`.
- **Endpoints admin (JWT+roles/general):** `GET /licensing/status`, `POST /licensing/check-now`, `POST /licensing/activate` (verificación online). `GET /health` y `/licensing/*`/`/auth*`/estáticos permanecen whitelisted según `LicenseGuard`.

## Servidor de licencias (producción)
- **URL:** `LICENSE_SERVER_URL=https://licencias.example.com` (ajustar si la URL pública definitiva difiere).
- **Verificación online:** `POST /v1/license/verify` consume token firmado del central; manifiestos/updates según contrato (Pilar 1/3b).
- **Clave pública RSA pinneada** (licencia y manifiestos): configurar `LICENSE_PUBLIC_KEY_PEM` en `.env` (PEM con `\n` escapados). Debe corresponder a `/.well-known/license-jwks.json` (`kid` activo, p. ej. `prod-20261111`). **Sin exponer claves privadas.**

```env
LICENSE_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA/haJWv8Qy5YJwT/gZKrB\nVJ2snwn1y3xoRoRz6QQu2sRuT5S/8lag8cm6OjfiOUTi/pXGyPv8hNYiPuEbI50v\na3kUovqOgWJbXo0HNX6dcphm41Z5p4pG9V8ZxFg383ju7NpgxL2QH5n+iTkr2fNp\n5iNepo26P6vDjW8G/0hwzH7X+AbD3/rlfOMUqXj3BosfSqtmBh7S7w3R1nt3dxHo\nJijaJ2jg9TprP+TSrr+bRqQFa+jlSW4ybUHikC3vDhCDDL6Vf8oa6rzW3TMxV9IO\nGN9MpLgAJNf4xIJmzLZf0HJ7WzE6sLKX3Oocd2VX3e4RlV3zjSdL/mtN/bgo48tp\nIbWsp2bBqA2XGfvpRSDDHGslIbbfvDI1g65nf8dOHmxsyGokCOE4AlpuBSo2BjUk\nLI/ioy81C5eSYuN+zUbsGwzxzcf4AEU59upMZ6lFCcADutTCjk3pNSxQ9NSMCFve\nqMTnos6BrGKmMzVGYUR7EHof+hP5IsrzmzeQEwoEYm8ATdyjzPRgJBH37dqecrSz\nqhiN7pJH4qd0h4Zdb8JbwDv8wRk8QIv+eHK+7zZTr/er77VMDZ9Wj9E910KMM8VD\nXSTd7UQ9HfycIyZwvZtBGBGmzdC0Q/cD7U8pYO13FW4M/3l/lDeKCtEkNf4ovU3S\n18uNU/XDvuX9kJQAlwNDRAMCAwEAAQ==\n-----END PUBLIC KEY-----"
```

## Configuración de piloto (obligatoria, F5)
- `LICENSE_ENFORCEMENT=grace` (no `strict`).
- `UPDATES_AUTO_ENABLED=false` (**no habilitar auto-update estricto**).
- `UPDATE_CHANNEL=stable`, `LICENSE_GRACE_HOURS`, `LICENSE_CLOCK_SKEW_SEC`, intervalos según `.env.example`.

## Instalación (Windows, un solo clic)
- **Método soportado:** instalador `setup.exe` (Inno Setup). Empaqueta `deploy/docker-compose.prod.yml`, `.env.example` y `deploy/windows-installer/bootstrap.ps1`; crea `dbdata/`, `backups/`, `license/`, genera `.env` seguro si falta y levanta `docker compose -f docker-compose.prod.yml up -d`. Acceso directo **"Sistema Aserradero ERP"** → `http://localhost:3000`.
- **Deprecado/eliminado:** `deploy/install.sh`, `deploy/install.bat`.
- Guía: `docs/windows-packaging.md`.

## Hardening base (despliegue)
- **DB aislada:** `deploy/docker-compose.prod.yml` sin `ports` en `db`, red interna `internal`, `no-new-privileges`.
- **Volúmenes sensibles:** `./license` (identidad/estado D4) y `./backups` con permisos restringidos.
- **Headers:** `helmet` activo en `src/main.ts` (CSP deshabilitada por SPA inline). TLS/CORS/rate-limits finos y alertas en infraestructura/proxy/operación.

## Referencias
- SDD: `specs/licenciamiento-actualizaciones-onprem/{spec,plan,tasks}.md`
- Runbooks: `docs/runbooks/update-recovery.md`, `docs/migrations.md`
- Instalación/empaquetado: `docs/windows-packaging.md`, `deploy/windows-installer/{setup.iss,bootstrap.ps1}`, `deploy/docker-compose.prod.yml`
