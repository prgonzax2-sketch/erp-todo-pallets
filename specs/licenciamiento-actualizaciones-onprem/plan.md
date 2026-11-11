# Plan — Licenciamiento, verificación y actualizaciones on-prem (SDD)

**Spec:** `specs/licenciamiento-actualizaciones-onprem/spec.md` (D1–D10 aprobados).  
**Estado:** planificación aprobada, lista para ejecución por fases. **No hay implementación de código en este entregable.**

## 1. Visión de arquitectura

### 1.1 Componentes y límites
| Componente | Ubicación | Responsabilidad | No responsabilidad |
|---|---|---|---|
| **License/Release Server (Pilar 1)** | Servicio central independiente (repo/carpeta propia) + DB Postgres propia | Catálogo clientes/máquinas/licencias, emisión/verificación firmada RS256, revocación/rebind auditado, publicación de manifiestos de release firmados, JWKS/rotación `kid` | Ejecutar el ERP, acceder a datos de negocio, aplicar updates en plantas |
| **Cliente de licencia + notificador (Pilar 2)** | Dentro del ERP (`src/licensing`, `src/updates`) | Ancla/fingerprint, verificación arranque+cron, caché token firmado, gracia 72 h, enforcement D1, estado admin/UI, consulta manifiesto y notificación | Distribuir/instalar binarios, ejecutar migraciones/rollback host, gestionar claves privadas del central |
| **Instalador + agente host (Pilar 3)** | Host on-prem (`deploy/install.*`, `deploy/update-agent.*`, compose prod) | Prechecks, layout/secretos/volúmenes, seed admin one-shot, activación inicial, update nocturno (firma/digest→backup→pull→migración→health→rollback) | Lógica de negocio ERP, firma de licencias (usa/verifica artefactos firmados) |

### 1.2 Confianza y flujo criptográfico
- **Firma:** RS256, `kid` obligatorio, TTL corto en verify (24–36h). Clave privada **solo** en central (KMS/Vault/secreto). 
- **Verificación:** ERP cliente y agente host validan firma con **clave pública pinneada**; JWKS soporta rotación con solapamiento pero no reemplaza pinning inicial. Toda comunicación sobre TLS.
- **Manifiesto de release:** firmado e incluye `image_ref` + `image_digest_sha256` (+ hashes de migración/compose según contrato); el agente rechaza cualquier artefacto no coincidente.
- **Identidad (D4):** `instance_id` estable en `./license/instance.key` (volumen) + `machine_id_hash`/`fingerprint_hash` best-effort; rebind manual auditado (D3). 
- **Tiempo:** `server_time` + tolerancia de skew; detección de clock rollback para no extender gracia.

### 1.3 Flujos principales (texto)
1. **Instalación/activación:** instalador → prechecks → genera secretos/layout → levanta compose (app+db) → seed admin one-shot → crea/lee `instance.key` → `POST /v1/license/verify` → persiste JWS/estado → ERP operativo (según D1).
2. **Verificación periódica:** `OnModuleInit` + cron diario (D10-aware, con backoff) → verify online; si OK actualiza token/estado; si falla red pero token vigente y dentro de gracia sin rollback → `GRACE/CACHED`; si sin validez/gracia → enforcement D1.
3. **Notificación de update:** `UpdateNotifierService` consulta `/v1/releases/latest`, valida manifiesto firmado y compatibilidad, expone estado admin; no ejecuta cambios.
4. **Update nocturno (agente host):** ventana configurable+jitter → lock → manifiesto firmado válido → backup verificado → pull por digest → apply compose → migraciones versionadas (`synchronize=false`) → health/smoke → éxito/registro; fallo → rollback imagen previa (+ restore guiado si migración irreversible).

## 2. Diseño por pilar

### 2.1 Pilar 1 — Auth/License Server (central)
- **Stack sugerido:** NestJS (consistencia), TypeORM/Prisma opcional, Postgres propia, `jose`/JWT RS256, rate-limit, helmet, logging estructurado.
- **Modelo de datos (mínimo):**
  - `customers(id, nombre, contacto, estado, metadata)`
  - `plans(id, code, duration_days [30,90,180,365], features_json, active)`
  - `machines(id, customer_id, machine_id_hash, instance_id, fingerprint_hash, status, last_seen_at, bound_at, metadata)`
  - `licenses(id, machine_id, plan_id, status, starts_at, ends_at, grace_hours_default, revoked_at, reason, created_by)`
  - `rebind_events(id, machine_id, from_instance, to_instance, reason, actor, created_at)` (auditoría D3)
  - `issued_tokens_audit(id, license_id, jti, kid, iat, exp, result)` (sin almacenar JWS completo si evitable)
  - `releases(id, channel, version_semver, image_ref, image_digest_sha256, migration_bundle_hash, compose_hash, mandatory, min_supported_version, manifest_jws, published_at, revoked)`
  - `admin_users`/RBAC mínimo.
- **Endpoints:**
  - Público: `POST /v1/license/verify`, `GET /v1/releases/latest`, `GET /.well-known/license-jwks.json`, `GET /health`.
  - Admin (protegido, MFA recomendado): CRUD clientes/máquinas/licencias, revocar/suspender, **rebind** con evidencia, publicar/revocar releases, consultar auditoría.
- **Claims/verify JWS:** `iss, sub(machine_id_hash), instance_id, license_status, plan, valid_from, valid_until, grace_hours, entitlements, server_time, iat, nbf, exp, jti, min_supported_version`.
- **Seguridad operativa:** TLS, WAF/rate-limit por IP+máquina, respuestas mínimas, llave privada fuera de DB/repo, rotación `kid` con ventana de aceptación dual, backups cifrados.

### 2.2 Pilar 2 — Módulo cliente en ERP (`erp-todo-pallets`)
- **Módulos/archivos previstos (patrón del repo):**
  - `src/licensing/licensing.module.ts`, `licensing.service.ts`, `licensing.controller.ts`, `machine-id.service.ts`, `license-state.service.ts`, `dto/*`, `entities/*`, `guards/license.guard.ts` (o interceptor/APP_GUARD compuesto), `jobs/license-validation.job.ts`.
  - `src/updates/updates.module.ts`, `update-notifier.service.ts`, `updates.controller.ts`, `dto/*`.
  - Integración: `AppModule` importa módulos; registrar `ScheduleModule` si no existe; añadir `GET /health` (si falta) y whitelist en enforcement.
- **Persistencia ERP:**
  - SQL idempotente `docs/sql-migrations/<fecha>-licensing-client-state.sql`:
    - `app_licensing_state` (single-row): `id(=1)`, `instance_id`, `machine_id_hash`, `fingerprint_hash`, `license_status`, `plan_code`, `valid_until`, `grace_deadline_at`, `last_check_at`, `last_server_time`, `last_token_jws`, `last_error`, `clock_tamper_suspected`, `enforcement_mode`, timestamps.
    - `app_installation_state` (single-row): `id(=1)`, `installed_version`, `admin_seeded_at`, `initialized_at`, `last_update_check_at`, `update_available_version`, `update_manifest_meta`.
  - Espejo de estado crítico en `LICENSE_STATE_PATH` (`./license/`) para resiliencia; migraciones TypeORM formales alineadas a D6 cuando aplique.
- **Endpoints ERP (admin, salvo whitelist explícita):** `GET /licensing/status`, `POST /licensing/activate`, `POST /licensing/check-now`, `GET /updates/status`.
- **Enforcement (D1):** `off|warn|grace|strict`. Guard compuesto: permite `GET /`, `GET /styles.css`, `GET /health`, `GET/POST /licensing/*` (flujo de activación/estado según política) y bloquea resto cuando corresponde (código 402/403 consistente). UI `index.html`: banner/overlay con estado, vencimiento, gracia y acción requerida (cambio acotado, UTF-8 sin BOM).
- **Notificación:** compara `APP_VERSION` con manifiesto firmado vigente; persiste `update_available_version`; sin ejecución.

### 2.3 Pilar 3 — Instalador y agente (host)
- **`deploy/` (artefactos previstos):**
  - `install.sh`, `install.ps1`/`install.bat` (idempotentes), `docker-compose.prod.yml` (o override), `.env.example`, `update-agent.sh`/`.ps1`, `manifest.schema.json`, `README-install.md`.
  - Volúmenes/layout: `./dbdata` o volumen nombrado, `./backups`, `./license`, `.env` (600), permisos restringidos.
- **Instalador:** prechecks (Docker/Compose, SO, puertos, disco, NTP/TZ) → config interactiva → genera secretos (`JWT_SECRET`, DB) → pull imagen por tag+digest → `compose up -d` → wait health → seed admin **one-shot** (idempotente, `app_installation_state.admin_seeded_at`) → intenta activación de licencia.
- **Agente nocturno (D10):** cron/Task Scheduler a hora configurable (default 03:00 local) + jitter + lock.
  1. Fetch manifiesto firmado (`/v1/releases/latest`), verificar firma RS256 pinneada y compatibilidad.
  2. Si no hay update o no hay red: registrar estado y salir (reintento según política).
  3. Backup verificado: `pg_dump` consistente + copia `./backups`, `./license`, `.env`, compose; retención.
  4. Pull `image_ref@sha256:digest`, aplicar compose si aplica.
  5. `compose up -d` y ejecutar migraciones versionadas (D6) con `TYPEORM_SYNCHRONIZE=false`.
  6. Health/smoke (`GET /health`, arranque estable). **Éxito:** registrar versión. **Fallo:** rollback a digest previo; si migración irreversible aplicada parcialmente → marcar “restore requerido” y detener auto-reintentos destructivos.
- **Obfuscación (D9):** excluida del MVP; si se habilita, etapa de build FE separada/reversible.

## 3. Configuración y variables de entorno (objetivo)

### 3.1 ERP cliente (adiciones previstas)
- `APP_VERSION`, `LICENSE_SERVER_URL`, `LICENSE_PUBLIC_KEY_PEM` (o `LICENSE_PUBLIC_KEY_PATH`), `LICENSE_ENFORCEMENT` (off|warn|grace|strict, default `grace`), `LICENSE_CHECK_CRON` (default diario), `LICENSE_GRACE_HOURS` (default 72), `LICENSE_STATE_PATH` (default `/app/license`), `LICENSE_HTTP_TIMEOUT_MS`, `LICENSE_CLOCK_SKEW_SEC`, `UPDATE_CHANNEL` (stable), `UPDATES_AUTO_ENABLED` (flag informativo/agente), `HEALTH_ENABLED` (si aplica).

### 3.2 Servidor central
- `DATABASE_URL`, `SIGNING_PRIVATE_KEY(_PATH)` (secreto), `SIGNING_KID`, `PREVIOUS_PUBLIC_KEYS` (rotación), `VERIFY_TOKEN_TTL_HOURS`, `RATE_LIMIT_*`, `ADMIN_AUTH_*`, `TLS_*`.

### 3.3 Agente/instalador (host)
- `UPDATE_WINDOW` (default `03:00`), `UPDATE_JITTER_MINUTES`, `REGISTRY_*` (si aplica), `BACKUP_RETENTION_DAYS`, `LICENSE_PUBLIC_KEY_PEM`/pin, rutas de instalación.

## 4. Estrategia de datos y migraciones (D6)
1. **Inventario y baseline:** auditar drift sync-dev vs prod; congelar esquema vigente como referencia.
2. **SQL idempotente (cliente):** agregar `docs/sql-migrations/<fecha>-licensing-client-state.sql` para tablas de estado/licencia/instalación (safe, `IF NOT EXISTS`, constraints single-row).
3. **Pipeline prod:** `TYPEORM_SYNCHRONIZE=false` obligatorio; migraciones versionadas (TypeORM CLI o SQL numerados con runner/tabla de control) empaquetadas por release, revisadas y probadas en staging/copia.
4. **Releases con cambio de esquema:** manifiesto declara necesidad de backup/migración; agente ejecuta backup antes de migrar.
5. **Rollback:** app reversible por imagen previa; esquema reversible solo si migración `down` segura probada, de lo contrario **restore desde backup** (runbook). Nunca usar sync para “corregir” prod.

## 5. Estrategia de testing y verificación

| Nivel | Alcance | Criterio de pase |
|---|---|---|
| **Unit (Vitest)** | Firma/verificación JWS, claims/exp/kid/mismatch, gracia, clock rollback, `MachineIdService` (ancla/fallback/hash), parser/validación de manifiesto y semver, cálculo de estado | Casos borde deterministas, sin red |
| **Integración (ERP)** | `LicensingService/Guard/Controller`, persistencia estado, enforcement por modo D1, bootstrap, `check-now`, notificador updates, seed one-shot idempotente | `npx vitest run src/licensing src/updates` (y áreas afectadas) verdes |
| **Integración (central)** | `/verify`, `/releases/latest`, JWKS, revocación/rebind, rate-limit, auditoría | Contrato válido y fixtures firmadas consumibles por cliente/agente |
| **E2E/operativo** | Login/uso normal con licencia válida, gracia offline simulada, bloqueo/aviso según modo, activación, notificación de update | DevTools read-only (`http://localhost:3000`), consola sin errores nuevos atribuibles, móvil 390×844 |
| **Simulacros de campo (staging/copia)** | Corte red 72–96 h, skew/rollback de reloj, update OK, fallo health/migración, corte a mitad, rollback/restore | Procedimientos de runbook ejecutables y resultado esperado |
| **Build/deploy** | `npm run build`, `npm run lint` (si aplica), tests focalizados; `docker-compose up -d --build app` (index/dist en imagen) | Sin regresiones |

## 6. Seguridad, supply-chain y hardening (checklist de diseño)
- Pinning de clave pública; verificación estricta de firma/claims/digest; TLS; rate-limit.
- Secretos generados por instalador, nunca en repo/logs; permisos restrictivos (`.env`, `instance.key`).
- Prod: `synchronize=false`, DB no publicada, CORS/headers revisados, healthcheck expuesto controladamente.
- Registry autenticado (D5), manifiestos firmados, trazabilidad versión↔digest↔migración.
- Principio de mínimo privilegio en agente host y en admin del central; auditoría de rebind/revocación/publicación.

## 7. Rollout, operación y rollback
- **Rollout:** staging → piloto 1–2 plantas (`LICENSE_ENFORCEMENT=grace`, `UPDATES_AUTO_ENABLED=false`) → ajuste → oleadas; primera ventana nocturna asistida.
- **Rollback app:** imagen previa por digest/tag, `compose up -d`, healthcheck.
- **Rollback datos:** restore `pg_dump` desde `./backups` cuando migración no reversible o inconsistente; matriz versión-app ↔ esquema en release notes/runbook.
- **Runbooks (`docs/licenciamiento.md`, `docs/actualizaciones-onprem.md`):** activación, diagnóstico `/licensing/status`, gracia/reloj/NTP, rebind (D3), update manual/forzado, rollback/restore, rotación de claves, interpretación de estados y fallos de update.

## 8. Fases, dependencias y estimación orientativa
| Fase | Alcance | Dependencias | Salida | Est. |
|---|---|---|---|---|
| **F0** | SDD, cierre operativo D1–D10, contrato, baseline hosts/ops | Aprobación (completa) | spec/plan/tasks trazables | 1 sem |
| **F1** | Pilar 1 (central) | F0, infra TLS/DB/KMS/registry | verify+releases+JWKS+admin operativos | 2–3 sem |
| **F2** | Pilar 2 (ERP cliente) | F0, contrato F1 | enforcement+notificación integrados y verificados | 2–3 sem |
| **F3** | Pilar 3a (instalador/bootstrap) | F2, layout prod | instalación reproducible + seed one-shot + activación | 1–2 sem |
| **F4** | Pilar 3b (agente+migraciones) | F1,F3, **D6 pipeline listo** | update nocturno seguro con rollback simulado | 2–3 sem |
| **F5** | Hardening, piloto, rollout | F2–F4 | piloto aprobado, runbooks y escalado | 1–2 sem |

**Riesgos de planificación:** disponibilidad de registry/KMS, definición final de telemetría contractual (D7), variabilidad de hosts Windows/Linux y acceso a fingerprint, y deuda de migraciones (D6) — F4 no inicia sin pipeline de migraciones formal.

## 9. Impacto previsto en el repo `erp-todo-pallets`
- **Nuevos:** `src/licensing/**`, `src/updates/**`, `docs/sql-migrations/<fecha>-licensing-client-state.sql`, `deploy/*` (instalador/agente/compose prod/docs), `docs/licenciamiento.md`, `docs/actualizaciones-onprem.md`, specs/tasks actualizados.
- **Modificados (mínimo necesario):** `src/app.module.ts`, `src/main.ts` (health/serving/whitelist según diseño), `.env.example`, `docker-compose.yml`/overrides, `Dockerfile` (LABEL/HEALTHCHECK opcional), `docs/migrations.md`, `index.html` (banner/estado, cambio acotado), `CHECKPOINT_CONTEXT.md`, `MEMORY.md`.
- **Sin cambios destructivos:** dominio/negocio existente, contratos vigentes de reportes/turnos salvo adiciones aditivas y enforcement explícito por configuración.