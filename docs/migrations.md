# Base de datos y migraciones (TypeORM + PostgreSQL)

> **D6 (SDD licenciamiento/actualizaciones on-prem, F4.1 — 2026-11-11):** pipeline formal de migraciones TypeORM versionadas. **Producción/on-prem desatendido: `TYPEORM_SYNCHRONIZE=false` obligatorio.** No depender de `synchronize` para cambios de esquema en releases.

## Pipeline TypeORM (CLI, F4.1)

- **DataSource CLI:** `src/database/data-source.ts` (compila a `dist/database/data-source.js`). Carga `.env` si existe (sin dependencia externa), `synchronize:false`, `entities: ['dist/**/*.entity.js']`, `migrations: ['dist/database/migrations/*.js','dist/migrations/*.js']`, `migrationsTableName: 'migrations'`.
- **Scripts npm:** `typeorm`, `migration:run`, `migration:revert`, `migration:show`, `migration:generate` (todos con `-d dist/database/data-source.js`). Requiere **`npm run build`** previo (migraciones/DataSource se ejecutan desde `dist/`).
- **Comandos típicos:**
  ```bash
  npm run build
  npm run migration:show
  npm run migration:run
  npm run migration:revert
  # Generar (revisa drift antes de commitear):
  npx typeorm migration:generate src/database/migrations/<NombreDescriptivo> -d dist/database/data-source.js
  ```
- **Contexto de conexión:** dentro de Docker Compose dev la app usa `DB_HOST=db`; desde el host (CLI local) usar `DB_HOST=localhost` y credenciales/puerto publicados (según `.env`/`DB_PORT_PUBLISH`). En producción, ejecutar con las variables/entorno del release (contenedor/app) apuntando a la DB correcta.
- **Empaquetado por release:** las migraciones compiladas (`dist/database/migrations/*.js`) deben incluirse en la imagen/artefacto del release (pipeline build). El agente de actualización (F4.2+) solo aplicará migraciones versionadas del artefacto firmado/desplegado.

## Baseline y estado de entornos

- **Baseline congelado (F4.1):** `src/database/migrations/1710000000000-BaselineSchema.ts` (`BaselineSchema1710000000000`) congela el esquema actual (snapshot schema-only, 2026-11-11) para **bases nuevas/vacías** (`migration:run` crea el esquema completo).
- **Entornos existentes (esquema ya aplicado por `synchronize`/SQLs previos, p.ej. dev actual):** **no re-ejecutar** el baseline sobre datos/esquema vivo. Marcar como aplicado con:
  ```bash
  npm run build && npx typeorm migration:run --fake -d dist/database/data-source.js
  ```
  (requiere conexión válida; crea/registra en tabla `migrations` sin ejecutar DDL). Validar con `migration:show`.
- **Drift inventariado (F4.1):** el esquema real contiene índices/constraints creados por SQLs idempotentes/`DbHardeningService` (p.ej. `idx_rpt_*`, `uq_*`, `UQ_cierres_*`, `IDX_cierres_historial_as_clave`, `chk_*` singleton) que pueden diferir del naming inferido por metadata TypeORM. **No aplicar migraciones generadas automáticamente sin revisión**: pueden proponer drops/renames destructivos. Reconciliar drift en migraciones incrementales explícitas y seguras antes de confiar en `migration:generate` para cambios futuros.

## Convención de nomenclatura y cambios

- **Ubicación fuente:** `src/database/migrations/` (compilado a `dist/database/migrations/`). `migrations/` (raíz) reservado para compatibilidad de salida CLI si se usa.
- **Nombre/clase:** timestamp + nombre descriptivo en PascalCase, p.ej. `1710000000000-BaselineSchema.ts`, `1795000000000-AddXxxColumn.ts`. La clase debe exponer `name` coherente.
- **Contenido:** SQL/operaciones TypeORM explícitas en `up`/`down` cuando aplique; revisar `up` **y** `down` antes de merge/release. Preferir cambios aditivos/compatibles con datos existentes (columnas nullable, backfill controlado, índices online cuando sea posible).
- **Coexistencia SQL manual:** `docs/sql-migrations/*.sql` idempotentes siguen siendo válidos para hotfix/dev controlado; cualquier cambio de esquema que deba viajar en release desatendido debe quedar reflejado en migración versionada formal y documentado.

## Clasificación obligatoria: reversible vs irreversible

Toda migración incluida en un release debe clasificarse explícitamente (en PR/commit/nota de release o cabecera de la migración):

- **Reversible:** tiene `down` seguro, probado en copia/staging, que restaura el estado previo sin pérdida de datos no aceptada. El agente puede considerar rollback de esquema **solo** si el `down` es seguro y la política lo permite.
- **Irreversible (o sin `down` seguro):** incluye drops de datos/columnas/tablas, cambios destructivos, transformaciones no invertibles, o `down` no confiable. **Debe declararse irreversible**. Baselines y consolidaciones de snapshot se tratan como irreversibles salvo estrategia probada.

## Política de rollback del agente de actualización (D6, F4)

1. **Precondición:** `TYPEORM_SYNCHRONIZE=false` en prod. Solo releases con migraciones versionadas empaquetadas y validadas (firma/digest) pueden aplicarse.
2. **Secuencia segura (resumen F4):** validar release → **backup verificado** (`pg_dump` + `./license`, `.env`, compose, `./backups`, retención) → aplicar imagen (`pull` por digest, `compose up`) → ejecutar `migration:run` → health/smoke.
3. **Fallo antes de migrar:** abortar sin cambios de esquema; rollback de imagen/app automático si aplica.
4. **Fallo en/durante/después de migración:**
   - **Rollback automático de imagen/app** al digest previo cuando el sistema quede inconsistente a nivel aplicación.
   - **Rollback de esquema** únicamente si la migración es **reversible** y existe `down` seguro y ejecutable en ese estado.
   - Si la migración es **irreversible**, falló parcialmente, o no existe `down` seguro: **“RESTORE REQUERIDO”** desde el **backup verificado** pre-update. No reintentar migraciones destructivas automáticamente; detener y escalar según runbook.
5. **Registro:** el agente debe registrar resultado, versión/digest, migraciones aplicadas/fallidas y si se requiere restore.

## Dev/local (legado compatible)

- **Dev/local (default histórico):** `TYPEORM_SYNCHRONIZE` puede ser `true` (`.env`/compose) y TypeORM sincroniza entidades; los SQLs en `docs/sql-migrations/` son idempotentes y sirven como control/compatibilidad. En dev con esquema ya existente, usar `--fake` para registrar el baseline (ver arriba) y avanzar hacia migraciones formales.
- `src/app.module.ts`: `synchronize = TYPEORM_SYNCHRONIZE==='true'` o, por defecto, `NODE_ENV !== 'production'`. Para prod/staging establecer `TYPEORM_SYNCHRONIZE=false`.

## Runbook prod (resumen)

1. **Antes de cambiar:** respaldar DB (`pg_dump`/`./backups`) y configuración/licencia; auditar entidades vs esquema real; probar en copia/staging; clasificar migraciones (reversible/irreversible).
2. **Config:** `NODE_ENV=production` y/o `TYPEORM_SYNCHRONIZE=false`. No habilitar `synchronize` en prod.
3. **Esquema:** aplicar migraciones TypeORM versionadas (`migration:run`) tras backup verificado. Mantener `docs/sql-migrations/` y migraciones alineados cuando corresponda.
4. **Post-cambio:** `migration:show`, smoke de endpoints críticos (`/health`, `/conciliacion/*`, `/conteo-playa-rollos/*`, pedidos/producción), verificar ausencia de `synchronize` activo en logs.
5. **Incidente:** si migración irreversible falla o deja estado inconsistente → **restore requerido** desde backup verificado (no asumir que rollback de imagen corrige esquema).

> Cambio de configuración/operación: hacerlo con respaldo y en ventana controlada. `m3UtilPorP2`/coef/factorTn/`produccion.m3` son calibrables (ver `GET/PUT/DELETE /conciliacion/config` o UI dashboard); no inventar valores operativos.
