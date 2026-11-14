# Tasks — Contrato remoto Auth↔ERP (Pilar 2)

**Fecha:** 2026-11-14 (actualizado con aceptación Pilar 1)  
**Estado:** Contrato aceptado por Pilar 1; ejecución pendiente de URL oficial/SLA/E2E y de tareas de implementación ERP.

## Tareas

- [~] **T1 — Valores oficiales de distribución (Pilar 1/P2):** Autorización **A y B** recibida. Integrado: `SIGNING_KID=prod-20261111`, `LICENSE_PUBLIC_KEY_PEM` (SPKI, RS256) confirmada y `LICENSE_CHECK_INTERVAL_MS=1800000` (30 min, SLA indicado) en `.env.example`/`deploy/docker-compose.prod.yml`/docs; creada plantilla `specs/licensing-remote-contract/paquete-definitivo.template.env`. **Pendiente (bloqueante para remoto):** `LICENSE_SERVER_URL` HTTPS oficial real (placeholder provisto, aún no ingresado) y `API_ISSUER` oficial; alinear `APP_VERSION`/`APP_IMAGE_TAG` de release definitivo. `.env.example` conserva URL local de prueba hasta recibir la oficial.
  - *Archivos:* `.env.example`, `deploy/docker-compose.prod.yml`, `docs/licenciamiento.md`, `docs/windows-packaging.md`, `specs/licensing-remote-contract/paquete-definitivo.template.env`.
  - *Verificación:* valores parciales coherentes; validación final contra Auth/JWKS objetivo al ingresar URL oficial.

- [~] **T2 — Plantillas y defaults remotos (G1,G2,G5,G7):** aplicado intervalo SLA indicado (30 min) y comentarios de distribución remota/PEM-kid en `.env.example` y compose (default 1800000). **Pendiente:** fijar `LICENSE_SERVER_URL` HTTPS oficial (sin localhost/host.docker.internal) cuando se provea.
  - *Archivos:* `.env.example`, `deploy/docker-compose.prod.yml`.
  - *Verificación:* revisión de plantilla; `npm run build` OK.

- [x] **T3 — Bootstrap/instalador (G3,G6):** advertencia en `bootstrap.ps1` si `LICENSE_SERVER_URL` vacío o local (`localhost/127.0.0.1/host.docker.internal`) al leer `.env` post-generación/conservación; log WARN no bloqueante; idempotencia preservada.
  - *Archivos:* `deploy/windows-installer/bootstrap.ps1`, (doc) `docs/windows-packaging.md`.
  - *Verificación:* revisión de script (emite WARN en vacío/local, válido solo prueba local); sin ejecución en limpio en esta sesión. Pendiente recompilar instalador (T6) para incluir cambio.

- [x] **T4 — Diagnóstico de conectividad en verify (G4):** `verifyNow` usa `formatVerifyError` para clasificar DNS/red/timeout/TLS/conexión rechazada con `lastError` accionable; en fallo actualiza solo patch+`lastError` (preserva `licenseStatus`/vigencia/último éxito previos) → **inalcanzable ≠ revocado/suspendido/not_found**.
  - *Archivos:* `src/licensing/licensing.service.ts`.
  - *Verificación:* `npm run build` OK (2026-11-14). No hay tests `src/licensing/*` en el repo; sin simulación automatizada de red en esta sesión.

- [~] **T5 — Documentación contrato y operación remota (G5,G6):** actualizados `docs/licenciamiento.md` y `docs/windows-packaging.md` con contrato remoto aceptado, modelo pull/próxima verificación, regla inalcanzable≠revocado, prerequisitos Pilar 1, pasos/config, rotación PEM con pin estático (`kid=prod-20261111` confirmado) y refs a `specs/licensing-remote-contract/`. `LICENSE_SERVER_URL` oficial y SLA/intervalo final quedan **TBD** explícitos (pendiente cierre para T1–T2).
  - *Archivos:* `docs/licenciamiento.md`, `docs/windows-packaging.md`, `specs/licensing-remote-contract/*`.
  - *Verificación:* revisión documental.

- [ ] **T6 — Recompilar instalador y validar empaquetado:** tras fijar valores de release y cambios de plantillas/scripts, compilar `setup.iss` y verificar contenido/config.
  - *Archivos:* `dist-installer/*` (artefacto), `deploy/windows-installer/*`.
  - *Verificación:* build Inno Setup, inspección en instalación limpia.

- [ ] **T7 — Aceptación E2E remoto:** ERP en máquina A (sin Auth local), Auth alcanzable en URL B oficial/staging; activación, `check-now`, suspensión/revocación reflejada en próxima verificación exitosa; degradado con Auth caído (conserva estado/gracia, no marca revocado).
  - *Verificación:* evidencia (logs/UI/estado). Depende de despliegue Auth accesible (P1-A).

## Notas
- **PEM/kid `prod-20261111`:** confirmados por Pilar 1; ERP usa pin estático (`LICENSE_PUBLIC_KEY_PEM`) → rotación de clave requiere actualizar PEM en clientes (ventana con JWKS previo en Auth).
- **Pendientes de decisión/ops:** URL pública oficial (P1), SLA exacto de intervalo (negocio/ops), decisión ERP sobre mantener pin vs JWKS runtime a futuro, entorno E2E remoto. No incluir secretos en commits.