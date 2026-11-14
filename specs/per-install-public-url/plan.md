# Plan — URL pública propia por instalación/servidor

## Diseño técnico

### Fuente de verdad y persistencia
- **Env (preconfig/deploy):** `PUBLIC_BASE_URL` (alias aceptado: `SERVER_PUBLIC_URL`) en `.env`/compose.
- **Persistencia local (identidad por instalación):** archivo `server_public_url.txt` en `LICENSE_STATE_PATH` (`./license`, volumen). Se escribe al guardar desde setup/UI o puede sembrarse desde env al leer si no existe archivo (sin sobreescribir archivo existente, para respetar ediciones controladas). Valor efectivo: archivo > env (o env como semilla inicial) — se documenta precedencia clara: **configurada/persistida** prevalece para mostrar como identidad; CORS permite ambas fuentes válidas.
- **Dinámica (existente):** `tunnel_url.txt` (quick tunnel) → `dynamicTunnelUrl`.

### Backend
- `InstallationService` (`src/installation/installation.service.ts`):
  - `readConfiguredPublicUrl()` / `writeConfiguredPublicUrl(url)` con validación: parse URL, protocolo `https:`, sin `username/password`, sin path/query/fragment significativos (permitir `/` final normalizado), hostname presente. Retorna origen normalizado `https://host` (o `https://host:port` si no estándar, raro en túnel).
  - `getSetupStatus()` añade: `configuredPublicUrl`, `dynamicTunnelUrl` (=tunnel actual), mantiene `publicUrl`/`tunnelUrl` para compat (preferir configured, sino dynamic) y campos LAN/local existentes.
  - `setServerPublicUrl({ url }, user?)`: permitido si `!hasAdmin()` (setup inicial) **o** si se invoca en contexto admin (controlado) — para simplicidad y sin acoplar guard aquí, el endpoint permitirá guardarlo si `needsSetup`; para cambios post-setup se expone endpoint protegido por `JwtAuthGuard`+`RolesGuard` admin **o** se reutiliza patrón: endpoint público que exige `needsSetup` y otro admin-only. (Implementación: un endpoint `POST /installation/server-url` público que funciona en setup, y `POST /installation/server-url` con auth admin — se puede lograr con un controller method que permita si needsSetup o si request trae admin válido; alternativamente dos rutas. Decisión pragmática: permitir sin auth solo si `needsSetup`; si ya hay admin, requerir JWT admin — controller chequea `req.user` via optional auth o un segundo endpoint protegido. Para mantener cambios acotados: agregar endpoint que acepta guardar si `needsSetup` o si header Authorization válido de admin; pero más simple: `POST /installation/server-url` público pero solo cuando `needsSetup` (como `setup-admin`) y `PUT`/`POST /installation/server-url/admin` protegido — o validar en service con `hasAdmin`+flag. **Decisión implementada:** `POST /installation/server-url` permite si `needsSetup`; si ya existe admin, exige `Authorization` Bearer de usuario admin (validación vía `JwtService`/`Usuarios` en controller o helper) — acotado.
- `InstallationController`: `POST server-url` con body `{ url, remove?: boolean }` (remove permite limpiar en setup). Validación/guardia de admin-post-setup en controller/servicio.
- `main.ts` (`readAllowedOrigins`/CORS): además de `CORS_ORIGINS` y origen de `tunnel_url.txt`, permitir origen de `server_public_url.txt` y de `PUBLIC_BASE_URL/SERVER_PUBLIC_URL` env (cacheados con TTL como hoy).

### Frontend (`index.html`)
- **Setup wizard:** campo “URL propia del servidor (subdominio/HTTPS, acceso remoto)” con placeholder `https://cliente-erp.sistemaaserradero.com.ar`, botón Guardar (llama `POST /installation/server-url`), ayuda breve: “Se usa para compartir acceso remoto propio; la publicación del túnel/DNS se realiza según la guía operativa. Puede dejarse vacío y usar la URL dinámica temporal.”
- **Suscripción:** mostrar “URL propia del servidor (configurada)” (copiable) separada de “URL pública dinámica (túnel activo)” y LAN/local; texto explicativo si no configurada.
- Mantener `setupCopyText`/`updateUrls` compatible.

### Instalador / config
- `.env.example`: añadir `PUBLIC_BASE_URL=` (y comentario alias `SERVER_PUBLIC_URL`), documentar que es la URL propia/identidad remota del servidor.
- `deploy/docker-compose.prod.yml`: pasar `PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-}` (y/o `SERVER_PUBLIC_URL`).
- `deploy/windows-installer/bootstrap.ps1`: al generar/leer `.env`, preservar/incluir `PUBLIC_BASE_URL` si viene de entorno o dejar vacío; no pedir interactivamente en bootstrap silencioso (captura vía setup UI), pero documentar preconfig.
- `setup.iss`: sin cambio funcional obligatorio (captura en setup UI); se documenta en guía.

### Documentación
- `docs/operacion-url-remota-cliente.md` (nueva): alta de cliente (elegir subdominio único, configurar URL en instalador/setup, crear túnel nombrado en Cloudflare + DNS CNAME al túnel, `config.yml` ingress `http://localhost:APP_PORT`, ejecutar/servicio cloudflared), LAN vs remoto, checklist, seguridad (HTTPS/Access), relación con quick tunnel.
- Actualizar `README.md` / `.env.example` notas breves y `docs/windows-packaging.md` referencia si aplica.

### Licenciamiento
- Sin cambios en `src/licensing/*`, `LICENSE_SERVER_URL`, verificación, binding ni enforcement.

## Verificación
- `npm run build`.
- Tests focales existentes (`src/licensing/licensing.service.spec.ts` sigue pasando; tests de instalación si existen/no romper).
- Verificación manual lógica: `/installation/setup-status` incluye campos nuevos, CORS permite origen configurado (revisión de código), UI muestra campos.

## Fases
1. SDD (spec/plan/tasks).
2. Backend (servicio, controller, CORS, env/compose).
3. Frontend (setup + suscripción).
4. Docs/instalador config.
5. Verificación y cierre (checkpoint/memory si decisión duradera).
