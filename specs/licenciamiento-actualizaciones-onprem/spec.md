# Spec — Licenciamiento, verificación y actualizaciones on-prem (SaaS on-premise)

## Contexto y baseline (repo actual)
- **Producto:** ERP Aserradero (`erp-todo-pallets`) — NestJS 12 (TypeScript ESM, Node 22), TypeORM 1.1.1, PostgreSQL 15, SPA `index.html` + `styles.css` servida por la app, Docker (`Dockerfile` multi-stage, `docker-compose.yml` app+db, volumen `./backups:/backups`).
- **Auth actual:** JWT HS256 (`JWT_SECRET`, 1d), guards `JwtAuthGuard/RolesGuard/GeneralAdminGuard`, login rate-limited; sin seed automático de admin inicial (`scripts/reset-admin-password.cjs` solo resetea admins existentes).
- **Datos/esquema:** `autoLoadEntities`, `synchronize` solo no-prod cuando `TYPEORM_SYNCHRONIZE=true`; prod debe usar migraciones controladas (`docs/migrations.md`, `docs/sql-migrations/*`). `DbHardeningService` repara índices custom en arranque.
- **Operación actual:** backups in-process (`src/backups`, `pg_dump` a `BACKUP_DIRECTORY`), sin CI/release, sin licenciamiento, sin `MACHINE_ID`, sin updater/instaladores, versión estática `0.0.1`.
- **Restricciones relevantes:** `index.html` monolítico (deuda), CSP off en SPA, DB expuesta en compose dev, posibles credenciales/dev defaults; entorno de trabajo sin repo git.

## Objetivo
Diseñar e implementar (por fases SDD) un modelo comercial **on-premise** para "Sistema Aserradero" con tres pilares: (1) servidor central independiente de licencias/releases, (2) módulo cliente de licencia y notificación de updates integrado al ERP, (3) instalador y agente host de actualización nocturna segura. El modelo debe permitir control de vigencia/planes, operar con conectividad inestable, y minimizar riesgo operativo en planta.

## No objetivos
- DRM absoluto ni protección inviolable contra atacantes con control del host/contenedor/código.
- SaaS multi-tenant del ERP ni reescritura de dominio existente.
- Ejecución de actualizaciones desde dentro del proceso Nest (el cliente solo notifica).
- Obfuscación como mecanismo de seguridad efectivo (control cosmético opcional, fuera de MVP).

## Actores
- **Proveedor/Soporte:** opera Auth/License Server, emite/revoca licencias, gestiona rebinds y publica releases firmados.
- **Admin de planta (cliente):** instala/activa licencia, visualiza estado, gestiona operación local.
- **Sistema ERP cliente (on-prem):** valida licencia, aplica enforcement según política, notifica updates.
- **Agente host (on-prem):** ejecuta instalación/actualización nocturna (backup, pull por digest, migraciones, healthcheck, rollback) fuera del proceso Nest.

## Alcance — 3 pilares
1. **Pilar 1 — ERP Aserradero Auth Server (central, independiente):** NestJS liviano + DB propia. Gestión de licencias vinculadas a identidad de máquina (`machine_id_hash`/`instance_id`) y duraciones 30d/3m/6m/12m; endpoints públicos `POST /v1/license/verify` y `GET /v1/releases/latest` (manifiesto) con respuestas/manifiestos **firmados RS256** (anti-spoofing local por verificación criptográfica), publicación de clave pública por `kid` (JWKS), API/admin protegida (clientes, máquinas, licencias, revocación, rebind, releases).
2. **Pilar 2 — Módulo cliente de licencia y notificación (ERP actual):** módulos `src/licensing` y `src/updates`. Identidad local (`instance.key` persistente en volumen + fingerprint best-effort), verificación en arranque y **cron diario** con reintentos/backoff, caché de último token firmado válido, **gracia 72 h** y política **fail-closed configurable**; notificación de versión disponible (sin ejecutar update). UI de estado/bloqueo y endpoints admin de diagnóstico.
3. **Pilar 3 — Instalador y agente de actualización (host):** `install.sh`/`install.bat` (o `.ps1`) con prechecks Docker/Compose, configuración interactiva, secretos seguros, layout de volúmenes (`./backups`, `./license`, DB), **seed admin inicial idempotente (one-shot)**. Agente nocturno (ventana configurable, default 03:00 local + jitter): verifica manifiesto firmado y **digest** de imagen, backup verificado, pull/apply, migraciones versionadas (`synchronize=false`), healthcheck/smoke y **rollback automático** ante fallo.

## Decisiones aprobadas (D1–D10)
> Aprobadas por el usuario como baseline de implementación (ajustables solo vía nuevo acuerdo SDD documentado).

- **D1 — Enforcement:** `LICENSE_ENFORCEMENT=grace` por defecto (piloto/operación inicial) con transición a `strict` tras validación y contrato; modos soportados `off|warn|grace|strict`. En `grace/strict` se garantiza whitelist operativa mínima (salud, activación/estado de licencia y recursos estáticos necesarios) y comportamiento fail-closed solo cuando no hay licencia válida ni gracia vigente (según política).
- **D2 — Activación:** **activación inicial online** requerida en MVP; paquete de activación/renovación **offline firmado** queda diferido como extensión controlada (no bloquea MVP, diseño previsto).
- **D3 — Rebind:** **manual por soporte** con evidencia, audit trail y límites configurables por política comercial (sin rebind automático silencioso en MVP).
- **D4 — Identidad de máquina:** **ancla primaria `instance.key`** (UUID persistente en volumen `./license`, generada en instalación) como identidad operativa estable; **fingerprint hardware best-effort** auxiliar (DMI/`machine-id`/MACs normalizadas, mounts host read-only opcionales o provisto por instalador) para señal antifraude/rebind. Se envían hashes, no valores crudos innecesarios.
- **D5 — Distribución de updates:** **registry privado** con imágenes versionadas referenciadas por **tag + digest**; manifiesto `/v1/releases/latest` firmado incluye `image_ref` y `image_digest` (sha256). Autenticación de plantas al registry definida por operación (secret/config del instalador).
- **D6 — Migraciones:** formalizar **migraciones versionadas** antes de auto-update productivo (F4): TypeORM CLI o SQL numerados con runner/tabla de control (decisión de implementación dentro del estándar aprobado: sin `synchronize` en prod, idempotentes/revisadas, con plan de backup/rollback/restore). Alinear `docs/migrations.md` y releases.
- **D7 — Telemetría:** **mínima y contractual** para soporte: `app_version`, `last_check_ok_at`, `status` resumido y metadatos técnicos no sensibles reportables en verificación (según contrato y privacidad acordada); sin PII/datos de negocio.
- **D8 — Alcance de licencia:** **una licencia por instalación/máquina lógica** (ancla/instancia); reinstalación o cambio de hardware vía **rebind** controlado (D3). Sin HA/replica multi-activo bajo la misma licencia salvo licencia/acuerdo explícito.
- **D9 — Obfuscación:** **fuera de MVP** (opcional/cosmética, no criterio de seguridad ni de aceptación de licenciamiento); si se adopta, pipeline separado/reversible sobre artefactos FE externalizados.
- **D10 — Ventana de actualización:** **configurable por planta** (default **03:00 hora local**) con **jitter** para evitar tormenta; `UPDATES_AUTO_ENABLED` deshabilitable (recomendado en piloto/turnos sensibles). Horario y política de reintento documentados en runbook.

## Contrato técnico acordado (alto nivel)
- **`POST /v1/license/verify`** (público, TLS, rate-limited): request `{ machine_id_hash, instance_id, fingerprint_hash?, app_version, nonce? }` → respuesta **JWS RS256 (`kid`)** con claims `{ iss, sub, instance_id, license_status, plan, valid_from, valid_until, grace_hours, entitlements, server_time, iat, nbf, exp, jti, min_supported_version }` (TTL corto, p.ej. 24–36h) y errores estructurados sin filtrar internos.
- **`GET /v1/releases/latest?channel=stable&current=`**: **manifiesto firmado** `{ version, channel, image_ref, image_digest_sha256, migration_bundle_hash?, compose_hash?, mandatory, min_supported_version, published_at, notes }`.
- **Confianza de firma:** cliente/agente verifican con **clave pública RS256 pinneada** en artefacto/release o provisión controlada; `/.well-known/license-jwks.json` (o `/v1/keys/public`) soporta rotación por `kid` (solapamiento), pero no sustituye pinning inicial en canal no confiable.
- **Estados:** `ACTIVE|GRACE|EXPIRED|REVOKED|SUSPENDED|NOT_FOUND` (y mapeo a enforcement local según D1).
- **Reloj:** tolerancia de skew acotada; detección de **clock rollback** (`now < last_server_time - skew`) impide extender gracia indebidamente.

## Requerimientos funcionales
- **P1 (central):** alta/renovación/revocación de licencias por duración, vinculación a máquina/instancia, rebind auditado, emisión de verify firmado, publicación de releases firmados, rotación de claves `kid`, admin protegido, health y observabilidad básica.
- **P2 (cliente):** generación/lectura de `instance.key`, fingerprint best-effort, verificación en arranque + diaria (cron + reintentos), caché y validación de token firmado, gracia 72 h, enforcement por modo, endpoints admin de estado/activación/check, notificación de update disponible, UI de estado (banner/overlay) sin regresión de flujos.
  - **Extensión implementada (2026-11-12, activación manual/offline por token):** endpoint público `POST /licensing/activate-token` y `GET /licensing/activation-status` (sin sesión) para pegar JWS RS256 emitido por Pilar 1; verificación por clave pública pinneada, binding estricto `sub==machine_id_hash` e `instance_id`; aceptación defensiva de `exp` JWS corto en activación solo si vigencia contractual (`valid_until`+gracia) válida; pantalla `/activacion` de bloqueo obligatorio (muestra/copia `machine_id_hash` e `instance_id`) y vista “Mi Suscripción” (estado/plan/vencimiento exacto/días restantes/gracia/códigos + renovación). Tokens no activos (revocado/suspendido/expirado) bloquean según política aun si la firma es válida.
- **P3 (host):** instalador idempotente con prechecks y secretos seguros, seed admin one-shot, activación/licencia y volúmenes persistentes; agente con ventana configurable+jitter, verificación de firma/digest, backup verificado, migración versionada, health/smoke, rollback automático y runbooks.

## Requerimientos no funcionales y de seguridad
- **Disponibilidad offline:** operación permitida dentro de gracia con último token válido y sin manipulación de reloj detectada.
- **Seguridad:** TLS al central, pinning de clave pública, rate-limit anti-abuso, mínimo privilegio, secretos fuera de repo/logs/imágenes, permisos restrictivos (`.env`, `instance.key`, `./license`), DB no expuesta en prod, backups verificables.
- **Integridad de updates:** solo imágenes/manifiestos firmados y digest coincidente; `synchronize=false` en prod.
- **Operabilidad:** runbooks (activación, gracia/reloj, rebind, update/rollback, restore), healthchecks, mensajes de estado claros para soporte en planta.

## Análisis de riesgos y mitigaciones (resumen)
| Riesgo | Mitigación |
|---|---|
| Clave privada RS256 comprometida / sin rotación | KMS/Vault, `kid`, rotación con solapamiento, auditoría |
| Spoofing de verify/version | RS256 + **pinning** de clave pública, TLS, validación estricta de claims/digest |
| MACHINE_ID inestable en Docker/VM/hardware | `instance.key` como ancla (D4) + fingerprint auxiliar + rebind controlado (D3) |
| Reloj desfasado/manipulado | `server_time` + skew + detección de rollback, no extender gracia |
| Central caído / internet inestable | Token cacheado firmado, gracia 72 h, reintentos/backoff |
| Update interrumpido / migración fallida | Ventana+jitter, backup verificado, migraciones versionadas (D6), healthcheck, rollback/restore guiado |
| Supply-chain (imagen/manifiesto malicioso) | Manifiesto firmado + verificación de `image_digest`, registry controlado (D5) |
| Falsa seguridad (obfuscación/bypass local) | Obfuscación fuera de MVP (D9); licenciamiento como control comercial/defensa en profundidad, no DRM |
| Fuga de secretos/config insegura | Instalador genera secretos, permisos 600, no logs, DB no publicada en prod |

## Criterios de aceptación (por hito)
- **F0:** `spec.md/plan.md/tasks.md` aprobados en `specs/licenciamiento-actualizaciones-onprem/` con D1–D10 y contrato; decisiones trazadas.
- **F1 (Pilar 1):** servidor central emite licencias por duración, `/v1/license/verify` y `/v1/releases/latest` firmados RS256 verificables, JWKS/`kid` y rotación, admin/rebind/auditoría, tests de firma/expiración/revocación/rate-limit.
- **F2 (Pilar 2):** ERP genera/usa ancla, verifica firma pinneada, opera offline en gracia 72 h, aplica enforcement D1, expone estado admin y notificación de versión; sin regresión de auth/flujos; build + tests focalizados + DevTools OK.
- **F3 (Pilar 3a):** instalador en host limpio levanta stack con volúmenes/secretos correctos y seed admin one-shot idempotente; licencia activable.
- **F4 (Pilar 3b):** agente realiza update nocturno solo con manifiesto/digest válidos, ejecuta backup+migración+health y rollback automático ante fallo (simulado), con `synchronize=false`.
- **F5:** piloto documentado (≥1 planta), métricas/incidentes resueltos o aceptados, runbooks y hardening aprobados para escalado.

## Dependencias y prerrequisitos
- Infra/proveedor: hosting TLS del central, KMS/Vault para llave privada, registry (D5), política de soporte/rebind (D3/D7).
- Repo/ERP: formalización de migraciones (D6), adición de `/health` si falta, volumen `./license` en despliegue, endurecimiento de compose/secrets para prod.
- Operación: NTP/TZ correcto en hosts, espacio disco para backups/imágenes, ventanas de mantenimiento acordadas (D10).

## Fuera de alcance del MVP (seguimiento)
- Activación/renovación offline firmada end-to-end (D2 diferido).
- Rebind automático, telemetría extendida/BI, HA multi-activo bajo licencia compartida (D8).
- Obfuscación integrada al release (D9), app móvil/instalador gráfico avanzado.
- Automatización completa de soporte comercial/facturación en el central (puede iniciar manual).