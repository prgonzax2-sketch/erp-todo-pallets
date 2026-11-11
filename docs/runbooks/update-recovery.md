# Runbook de emergencia — RESTORE REQUERIDO (actualización on-prem)

**Alcance (SDD F4.7, D6):** guía de recuperación manual cuando el agente de actualización (`scripts/nightly-update.*`) falla y el **rollback automático (F4.6)** no deja el sistema operativo, o cuando una migración es **irreversible/parcial** y el estado de esquema/BD es incierto.  
**Objetivo:** identificar el último respaldo verificable en `./backups`, restaurar la base de datos desde el `pg_dump` comprimido y revertir `.env`/imagen/contenedor a la versión funcional previa.

> **Regla D6:** si la migración pudo ejecutarse/fallar parcialmente o no existe `down` seguro → **RESTORE REQUERIDO** desde backup verificado. No reintentar migraciones destructivas automáticamente.

---

## 1) Señales y contención inicial

1. **Confirmar el incidente** en el log del agente (por defecto `<DEPLOY_DIR>/backups/update-agent.log`):
   - Buscar `RESTORE REQUERIDO`, `migration_attempted`, errores de `migration:run`, `health` o `restore`.
   - Comandos (Linux/WSL/Git Bash; desde el directorio de despliegue, normalmente `deploy/`):
     ```bash
     cd <DEPLOY_DIR>   # ej.: ./deploy
     tail -n 200 backups/update-agent.log
     grep -n "RESTORE REQUERIDO\|F4.6\|migration_attempted\|ERROR" backups/update-agent.log | tail -n 50
     ```
   - PowerShell (Windows):
     ```powershell
     Set-Location <DEPLOY_DIR>
     Get-Content .\backups\update-agent.log -Tail 200
     Select-String -Path .\backups\update-agent.log -Pattern 'RESTORE REQUERIDO','F4.6','migration_attempted','ERROR' | Select-Object -Last 50
     ```
2. **Evitar ejecuciones concurrentes:** no lanzar `nightly-update.*` ni aplicar migraciones hasta estabilizar. Si existe lock huérfano, revisarlo antes de borrarlo:
   ```bash
   ls -la backups/.nightly-update.lock 2>/dev/null || true
   cat backups/.nightly-update.lock 2>/dev/null || true
   ```
3. **No borrar `./backups`** ni sobrescribir artefactos del intento fallido; se usarán para la restauración.

**Variables/paths por defecto (ajustar a tu instalación):**
- Directorio de despliegue: `<DEPLOY_DIR>` (ej. `deploy/`, con `.env`, `docker-compose.prod.yml`, `dbdata/`, `backups/`, `license/`).
- Compose: `docker-compose.prod.yml` (o `COMPOSE_FILE` usado por el agente).
- Contenedores (compose prod): `sistema_aserradero_app`, `sistema_aserradero_db`.
- DB dentro de compose: host `db`, puerto `5432`, credenciales en `.env` (`POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB` o `DB_USERNAME/DB_PASSWORD/DB_NAME`).
- Prefijo de backup por intento: `update-YYYYmmdd-HHMMSS-<pid>`.

---

## 2) Identificar el último estado estable en `./backups`

Cada intento de actualización crea (F4.4) artefactos con el mismo `<prefix>` en `./backups`:
- `<prefix>-db.sql.gz` — dump PostgreSQL comprimido (**crítico**).
- `<prefix>-.env` — copia del `.env` previo (imagen/config previa).
- `<prefix>-license.tar.gz` — copia de `./license`.
- `<prefix>-compose.yml` — copia del compose (si existía).
- `<prefix>-state.json` — estado previo capturado por el agente (`prev.image`, `prev.tag`, `prev.id`, `createdAt`).

### 2.1 Localizar el intento fallido (prefijo)
- Por log (recomendado): buscar el prefijo registrado (`update-...`) asociado al fallo:
  ```bash
  grep -n "prefijo\|Backup:" backups/update-agent.log | tail -n 30
  ```
- Por fecha de archivos (más recientes primero):
  ```bash
  ls -lt backups/update-*-state.json 2>/dev/null | head
  ls -lt backups/update-*-db.sql.gz 2>/dev/null | head
  ```
  ```powershell
  Get-ChildItem .\backups\update-*-state.json | Sort-Object LastWriteTime -Descending | Select-Object -First 5 FullName,LastWriteTime,Length
  Get-ChildItem .\backups\update-*-db.sql.gz   | Sort-Object LastWriteTime -Descending | Select-Object -First 5 FullName,LastWriteTime,Length
  ```

Definir el prefijo a restaurar (ejemplo):  
`PREFIX=update-20261111-030512-1234` (Linux/bash) / `$PREFIX='update-20261111-030512-1234'` (PowerShell).

### 2.2 Verificar integridad del respaldo antes de restaurar
Elegir el **último prefijo cuyo `-db.sql.gz` sea válido y completo** (idealmente el del intento fallido, creado antes de aplicar/migrar; si estuviera corrupto, usar el prefijo anterior estable).

```bash
# Existencia y tamaño no nulo
ls -lh backups/${PREFIX}-db.sql.gz backups/${PREFIX}-.env backups/${PREFIX}-license.tar.gz backups/${PREFIX}-state.json 2>/dev/null

# Integridad del gzip
gzip -t backups/${PREFIX}-db.sql.gz && echo "OK: dump comprimido íntegro" || echo "ERROR: dump corrupto"

# Estado previo capturado (imagen/tag/id)
cat backups/${PREFIX}-state.json
```
```powershell
Get-Item ".\backups\$PREFIX-db.sql.gz",".\backups\$PREFIX-.env",".\backups\$PREFIX-license.tar.gz",".\backups\$PREFIX-state.json" -ErrorAction SilentlyContinue | Select Name,Length,LastWriteTime
# Inspección rápida del gzip (PowerShell nativo no tiene gzip -t; usar WSL/Git Bash o 7zip si disponible)
Get-Content ".\backups\$PREFIX-state.json"
```

> Si `-db.sql.gz` falla `gzip -t` o está vacío: **no usarlo**; seleccionar el prefijo estable anterior con dump íntegro. Documentar la brecha de datos según RPO.

### 2.3 Determinar la versión/imagen previa funcional
- Desde `-state.json`: `prev.tag` (p.ej. versión anterior), `prev.id` (id local de imagen), `prev.image` (referencia usada antes del intento).
- Desde `- .env` del backup: valores previos de `APP_IMAGE`, `APP_IMAGE_TAG`, `APP_VERSION`.
- Comparar con el manifiesto/versión fallida registrado en `update-agent.log`.

---

## 3) Preparación: cargar entorno y detener aplicación

Ejecutar desde `<DEPLOY_DIR>` con el `.env` **actual** para conocer credenciales/compose (el `.env` se revertirá después con el del backup).

**Linux/bash (compose v2 preferido, fallback v1):**
```bash
cd <DEPLOY_DIR>
set -a; [ -f .env ] && . ./.env; set +a
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_CMD=(docker compose)
docker compose version >/dev/null 2>&1 || COMPOSE_CMD=(docker-compose)

DB_USER="${POSTGRES_USER:-${DB_USERNAME:-admin}}"
DB_NAME="${POSTGRES_DB:-${DB_NAME:-erp_database}}"
APP_PORT="${APP_PORT:-3000}"

# Ver estado
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env ps
```

**PowerShell (referencia de comandos equivalentes):**
```powershell
Set-Location <DEPLOY_DIR>
# Cargar variables clave manualmente o inspeccionar .env (evitar exponer secretos en consola compartida)
$COMPOSE_FILE = if ($env:COMPOSE_FILE) { $env:COMPOSE_FILE } else { "docker-compose.prod.yml" }
$DB_USER = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } elseif ($env:DB_USERNAME) { $env:DB_USERNAME } else { "admin" }
$DB_NAME = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } elseif ($env:DB_NAME) { $env:DB_NAME } else { "erp_database" }
docker compose -f $COMPOSE_FILE --env-file .env ps
```

**Detener la app (mantener DB disponible para restore):**
```bash
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env stop app || true
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env rm -f app || true
```
> Si el contenedor quedó en mal estado: `docker ps -a --filter name=sistema_aserradero_app` y `docker rm -f sistema_aserradero_app` (con precaución).

Asegurar que `db` esté saludable:
```bash
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env up -d db
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env exec -T db pg_isready -U "$DB_USER" -d "$DB_NAME"
```

---

## 4) Restaurar la base de datos desde el `pg_dump` comprimido

> **Destructivo/controlado:** recrea el esquema `public` y reemplaza datos por el contenido del dump. Requiere ventana de mantenimiento. Confirmar que el `PREFIX` y el archivo son correctos.

**(Recomendado) Copia de seguridad adicional del estado actual (por auditoría/último recurso):**
```bash
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups/manual
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip -c > "backups/manual/pre-restore-${TS}.sql.gz" || echo "WARN: no se pudo capturar estado actual"
```

**Restore (estrategia usada por el agente F4.6):**
```bash
cd <DEPLOY_DIR>
PREFIX="update-YYYYmmdd-HHMMSS-<pid>"   # reemplazar

# 1) Limpiar esquema público
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env exec -T db \
  psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# 2) Importar dump comprimido
gzip -dc "backups/${PREFIX}-db.sql.gz" | \
  "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env exec -T db \
  psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME"

echo "Restore DB finalizado para ${PREFIX}"
```

**PowerShell (ejemplo):**
```powershell
$PREFIX = 'update-YYYYmmdd-HHMMSS-<pid>'
docker compose -f $COMPOSE_FILE --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U $DB_USER -d $DB_NAME -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
# Import (requiere gzip disponible; en Windows usar WSL/Git Bash o 7z x -so)
# WSL/Git Bash recomendado:
# bash -lc "cd '<DEPLOY_DIR>' && gzip -dc backups/${PREFIX}-db.sql.gz | docker compose -f docker-compose.prod.yml --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U $DB_USER -d $DB_NAME"
```

**Verificación post-restore (mínima):**
```bash
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env exec -T db \
  psql -U "$DB_USER" -d "$DB_NAME" -c "\dt" | head
# Si aplica (F4.1): estado de migraciones (puede no existir en esquemas legacy)
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env exec -T db \
  psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT * FROM migrations ORDER BY id DESC LIMIT 5;" 2>/dev/null || echo "(tabla migrations no presente)"
```

---

## 5) Revertir `.env` y estado de licencia/configuración

1. **Restaurar `.env` previo** (imagen/tag/vars coherentes con el estado estable):
   ```bash
   cp -a .env ".env.broken.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
   cp "backups/${PREFIX}-.env" .env
   ```
2. **(Opcional, si el estado de licencia se corrompió o debe volver al momento del backup):**
   ```bash
   tar -xzf "backups/${PREFIX}-license.tar.gz" -C .
   ```
   > Esto restaura `./license` (p.ej. `instance.key`, `state.json`). Puede afectar activación/verificación local (D4); hacerlo solo si es necesario y con conocimiento del impacto.
3. **Compose:** el agente respalda `<prefix>-compose.yml`; si `docker-compose.prod.yml` fue alterado manualmente, comparar/restaurar:
   ```bash
   diff -u "backups/${PREFIX}-compose.yml" docker-compose.prod.yml || true
   # cp "backups/${PREFIX}-compose.yml" docker-compose.prod.yml   # solo si corresponde
   ```

---

## 6) Revertir imagen/contenedor a la versión funcional previa

Cargar valores revertidos:
```bash
set -a; . ./.env; set +a
APP_IMAGE_BASE="${APP_IMAGE:-ghcr.io/OWNER/erp-todo-pallets}"
APP_IMAGE_TAG="${APP_IMAGE_TAG:-latest}"
```

### 6.1 Si la imagen previa aún existe localmente (preferido)
Desde `-state.json`: usar `prev.id` (más robusto) o `prev.tag`:
```bash
cat "backups/${PREFIX}-state.json"
# Re-etiquetar por id (si está disponible localmente) para que compose use la previa
# docker tag <prev.id> "${APP_IMAGE_BASE}:${APP_IMAGE_TAG}"
```

### 6.2 Si no existe localmente
- **Si el deploy previo usaba tag/digest conocido y publicado:** `docker pull ${APP_IMAGE_BASE}:${APP_IMAGE_TAG}` (según `.env` restaurado) o `docker pull ${APP_IMAGE_BASE}@sha256:<digest-previo>` y etiquetar.
- **Si la imagen previa no está en registry:** la recuperación depende de que la imagen permanezca en el host (cache local) o de un artefacto/registry alterno; escalar a soporte. (Mitigación futura: retención de imágenes/registry de respaldo.)

**Levantar versión previa:**
```bash
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env up -d app
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env ps
```

---

## 7) Verificación post-recuperación y cierre

1. **Health/smoke:**
   ```bash
   curl -fsS "http://localhost:${APP_PORT:-3000}/health" && echo
   "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file .env logs --tail=100 app
   ```
2. **Confirmar versión/estado:** validar `APP_VERSION` operativo, acceso UI/login básico, y (si aplica) endpoints críticos del módulo afectado; evitar acciones destructivas.
3. **Migraciones:** con DB restaurada al dump del prefijo, el esquema debe corresponder a ese estado. Verificar coherencia de tabla `migrations` (si existe) con la imagen/versión en ejecución; **no ejecutar `migration:run`** hasta entender la causa raíz y disponer de un release/migración corregida y verificada.
4. **Registrar evidencia:** prefijo usado, hora, resultado de `gzip -t`, comandos ejecutados, estado final, y motivo del `RESTORE REQUERIDO` (migración irreversible/fallida, health KO, restore automático fallido, etc.).
5. **Rehabilitar agente:** solo tras estabilizar y validar en ventana controlada; considerar `--dry-run` o deshabilitar auto-update (`UPDATES_AUTO_ENABLED=false`) hasta el siguiente release corregido.

---

## 8) Notas y limitaciones

- Los respaldos viven en `<DEPLOY_DIR>/backups` (volumen host en compose prod). No hay rotación automática garantizada en F4.4; gestionar retención/espacio en disco operativamente.
- `pg_dump` no incluye objetos globales del clúster fuera de la DB (roles/tablespaces); el entorno se asume provisto por compose/instalación.
- Si el fallo ocurrió **antes** de intentar migración (`migration_attempted=0`), el rollback de app/imagen y `.env` puede bastar; restaurar DB solo si hay evidencia de inconsistencia.
- En Windows, los comandos de restore con pipes/`gzip` son más confiables desde **Git Bash/WSL** o PowerShell con utilidades equivalentes; los contenedores se operan igual con Docker Desktop.
- Complementar con políticas de `docs/migrations.md` (D6) y, cuando existan, `docs/actualizaciones-onprem.md` / `docs/licenciamiento.md` (F4.7 ampliado). Simulacros E2E: F4.8 (pendiente).
