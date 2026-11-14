# Tasks — URL pública propia por instalación/servidor

## F1 — SDD
- [x] T1. Spec/plan/tasks creados con decisiones (fuente de verdad, automatizado vs manual túnel/DNS, seguridad, licenciamiento sin cambios).

## F2 — Backend
- [x] T2. `InstallationService`: leer/escribir/validar URL configurada (`server_public_url.txt`), exponer `configuredPublicUrl`/`dynamicTunnelUrl` en `getSetupStatus` manteniendo compat.
- [x] T3. `POST /installation/server-url` (setup sin admin; admin autenticado post-setup) para guardar/eliminar URL propia.
- [x] T4. `main.ts` CORS: permitir origen de URL configurada (`PUBLIC_BASE_URL`/`SERVER_PUBLIC_URL` + archivo persistido).

## F3 — Config/instalador
- [x] T5. `.env.example` y `deploy/docker-compose.prod.yml` incluyen `PUBLIC_BASE_URL`/`SERVER_PUBLIC_URL`.
- [x] T6. `bootstrap.ps1` preserva/pasa `PUBLIC_BASE_URL` en `.env` generado/existente (sin romper flujo).

## F4 — Frontend
- [x] T7. Setup wizard: campo y guardado de URL propia del servidor.
- [x] T8. Suscripción: mostrar URL propia configurada vs túnel dinámico vs LAN/local.

## F5 — Documentación y verificación
- [x] T9. Documentación operativa alta cliente (subdominio+túnel Cloudflare+DNS, LAN vs remoto, checklist, seguridad).
- [x] T10. `npm run build` y verificación focal (licensing specs / smoke lógico). Actualizar `CHECKPOINT_CONTEXT.md` (y `MEMORY.md` si corresponde).
