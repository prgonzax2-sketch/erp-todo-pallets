#!/usr/bin/env bash
set -euo pipefail

# nightly-update.sh — Agente de actualización nocturna (Pilar 3b, F4.2–F4.6, D6/D10)
# - Ventana configurable (default 03:00 local) + jitter (UPDATE_JITTER_MAX_SEC, default 1800)
# - Lock en ./backups para evitar concurrencia (stale lock recuperable)
# - Consulta /v1/releases/latest, verifica firma RS256 del manifiesto JWS con LICENSE_PUBLIC_KEY_PEM
# - Backup verificado (pg_dump .sql.gz + copia ./license, .env, compose) antes de aplicar
# - Pull estricto por image_digest_sha256 (nunca tag flotante), apply + migration:run + smoke /health
# - Rollback automático de app/imagen ante fallo; RESTORE REQUERIDO si migración pudo quedar inconsistente
#
# Uso:
#   ./scripts/nightly-update.sh [--now|--no-wait] [--dry-run] [--deploy-dir <dir>] [--compose-file <file>]
#        [--log-file <file>] [--help]
# Flags:
#   --now, --no-wait   Omite espera de ventana y jitter (útil para pruebas/manual)
#   --dry-run          Ejecuta verificación (F4.2/F4.3) y muestra acciones; no backup/pull/apply
#   --deploy-dir DIR   Directorio de despliegue (default: auto, contiene .env y compose)
#   --compose-file F   Archivo compose relativo/absoluto (default: docker-compose.prod.yml en deploy dir)
#   --log-file FILE    Archivo de log (default: <deploy>/backups/update-agent.log)
#
# Env relevantes (desde .env del deploy): LICENSE_SERVER_URL, LICENSE_PUBLIC_KEY_PEM,
# APP_VERSION, UPDATE_CHANNEL, APP_IMAGE, APP_IMAGE_TAG, DB/POSTGRES creds, APP_PORT.
# Env opcionales agente: UPDATE_WINDOW_TIME=03:00, UPDATE_JITTER_MAX_SEC=1800,
# UPDATE_LOCK_STALE_SEC=21600, UPDATE_HTTP_TIMEOUT_MS=15000, UPDATE_HEALTH_RETRIES=12,
# UPDATE_HEALTH_DELAY_SEC=5, DEPLOY_DIR, COMPOSE_FILE.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

NO_WAIT=0
DRY_RUN=0
DEPLOY_DIR_ARG=""
COMPOSE_FILE_ARG=""
LOG_FILE_ARG=""

usage() {
  sed -n '2,40p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --now|--no-wait) NO_WAIT=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --deploy-dir) DEPLOY_DIR_ARG="${2:-}"; shift 2 ;;
    --compose-file) COMPOSE_FILE_ARG="${2:-}"; shift 2 ;;
    --log-file) LOG_FILE_ARG="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconocido: $1" >&2; usage; exit 2 ;;
  esac
done

resolve_deploy_dir() {
  if [[ -n "$DEPLOY_DIR_ARG" ]]; then echo "$DEPLOY_DIR_ARG"; return; fi
  if [[ -n "${DEPLOY_DIR:-}" ]]; then echo "$DEPLOY_DIR"; return; fi
  if [[ -f "$PWD/docker-compose.prod.yml" && -f "$PWD/.env" ]]; then echo "$PWD"; return; fi
  if [[ -f "$REPO_ROOT/deploy/docker-compose.prod.yml" ]]; then echo "$REPO_ROOT/deploy"; return; fi
  echo "$PWD"
}

DEPLOY_DIR="$(cd "$(resolve_deploy_dir)" 2>/dev/null && pwd || resolve_deploy_dir)"
COMPOSE_FILE="${COMPOSE_FILE_ARG:-${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.prod.yml}}"
if [[ "$COMPOSE_FILE" != /* ]]; then COMPOSE_FILE="$DEPLOY_DIR/$COMPOSE_FILE"; fi
ENV_FILE="$DEPLOY_DIR/.env"
BACKUPS_DIR="$DEPLOY_DIR/backups"
LICENSE_DIR="$DEPLOY_DIR/license"
DBDATA_DIR="$DEPLOY_DIR/dbdata"
LOG_FILE="${LOG_FILE_ARG:-${LOG_FILE:-$BACKUPS_DIR/update-agent.log}}"
LOCK_FILE="$BACKUPS_DIR/.nightly-update.lock"
LOCK_STALE_SEC="${UPDATE_LOCK_STALE_SEC:-21600}"
WINDOW_TIME="${UPDATE_WINDOW_TIME:-03:00}"
JITTER_MAX_SEC="${UPDATE_JITTER_MAX_SEC:-1800}"
HTTP_TIMEOUT_MS="${UPDATE_HTTP_TIMEOUT_MS:-15000}"
HEALTH_RETRIES="${UPDATE_HEALTH_RETRIES:-12}"
HEALTH_DELAY_SEC="${UPDATE_HEALTH_DELAY_SEC:-5}"

mkdir -p "$BACKUPS_DIR" 2>/dev/null || true
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }
log() { printf '[%s] %s\n' "$(ts)" "$*" | tee -a "$LOG_FILE" >/dev/null; echo "[update-agent] $*"; }
log_err() { printf '[%s] ERROR: %s\n' "$(ts)" "$*" | tee -a "$LOG_FILE" >/dev/null; echo "[update-agent][ERROR] $*" >&2; }
log_warn() { printf '[%s] WARN: %s\n' "$(ts)" "$*" | tee -a "$LOG_FILE" >/dev/null; echo "[update-agent][WARN] $*" >&2; }

# No exponer secretos en logs: nunca imprimir valores de .env/PEM/tokens/credenciales.
redact_cmd() { echo "(comando sensible omitido del log)"; }

# Cargar .env (KEY=VALUE simple, generado por install.sh)
load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_err "No se encontró .env en $ENV_FILE"
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { log_err "Comando requerido no encontrado: $1"; exit 1; }
}

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    log_err "Docker Compose no encontrado (docker compose / docker-compose)"
    exit 1
  fi
}

compose() {
  "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

acquire_lock() {
  local now pid mtime age
  now=$(date +%s)
  if [[ -f "$LOCK_FILE" ]]; then
    pid="$(grep -Eo 'pid=[0-9]+' "$LOCK_FILE" 2>/dev/null | head -1 | cut -d= -f2 || echo '')"
    mtime=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)
    age=$((now - mtime))
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      if [[ $age -lt $LOCK_STALE_SEC ]]; then
        log_err "Otra ejecución en curso (lock activo pid=$pid, age=${age}s). Abortando."
        exit 3
      fi
      log_warn "Lock con PID vivo pero antiguo (pid=$pid age=${age}s >= ${LOCK_STALE_SEC}s). Recuperando lock stale."
    elif [[ $age -lt $LOCK_STALE_SEC && -n "$pid" ]]; then
      log_warn "Lock huérfano reciente (pid=$pid no activo, age=${age}s). Abortando por seguridad."
      exit 3
    else
      log_warn "Lock stale detectado (age=${age}s). Recuperando."
    fi
    rm -f "$LOCK_FILE"
  fi
  printf 'pid=%s ts=%s host=%s\n' "$$" "$(ts)" "$(hostname 2>/dev/null || echo unknown)" > "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT INT TERM
  log "Lock adquirido: $LOCK_FILE"
}

sleep_until_window_and_jitter() {
  if [[ $NO_WAIT -eq 1 ]]; then
    log "Modo --now/--no-wait: omitiendo espera de ventana y jitter."
    return
  fi
  local hh mm now_epoch target_epoch today_target delta jitter
  hh="${WINDOW_TIME%%:*}"; mm="${WINDOW_TIME##*:}"
  [[ "$hh" =~ ^[0-9]{1,2}$ && "$mm" =~ ^[0-9]{1,2}$ ]] || { log_warn "UPDATE_WINDOW_TIME inválido ($WINDOW_TIME), usando 03:00"; hh=3; mm=0; }
  now_epoch=$(date +%s)
  today_target=$(date -d "today ${hh}:${mm}:00" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$(date +%Y-%m-%d) ${hh}:${mm}:00" +%s 2>/dev/null || echo "$now_epoch")
  target_epoch=$today_target
  if [[ $now_epoch -gt $target_epoch ]]; then
    target_epoch=$(date -d "tomorrow ${hh}:${mm}:00" +%s 2>/dev/null || echo $((today_target + 86400)))
  fi
  delta=$((target_epoch - now_epoch))
  if [[ $delta -gt 0 ]]; then
    log "Esperando ventana nocturna ${WINDOW_TIME} local (${delta}s)..."
    sleep "$delta"
  fi
  # jitter
  local maxj="${JITTER_MAX_SEC}"; [[ "$maxj" =~ ^[0-9]+$ ]] || maxj=1800
  if [[ $maxj -gt 0 ]]; then
    jitter=$((RANDOM % (maxj + 1)))
    log "Aplicando jitter aleatorio: ${jitter}s (max ${maxj}s)."
    sleep "$jitter"
  fi
}

json_get() {
  # json_get <json> <js-expression-like key> via node one-liner (sin deps)
  local json="$1" key="$2"
  JSON_IN="$json" KEY_IN="$key" node -e '
    try{const o=JSON.parse(process.env.JSON_IN||"{}"); const k=process.env.KEY_IN; const v=k.split(".").reduce((a,p)=>a&&a[p],o);
      if(v===undefined||v===null) process.stdout.write(""); else if(typeof v==="object") process.stdout.write(JSON.stringify(v)); else process.stdout.write(String(v));
    }catch{process.stdout.write("")}' 2>/dev/null || true
}

normalize_digest() {
  local d="$1"
  d="${d#sha256:}"
  echo "sha256:${d}"
}

extract_repo() {
  # de image_ref o APP_IMAGE obtener repo sin tag/digest
  local ref="$1"
  # quitar digest
  ref="${ref%%@*}"
  # quitar tag (último : después de última /)
  if [[ "$ref" == *:* ]]; then
    local last="${ref##*/}"
    if [[ "$last" == *:* ]]; then
      ref="${ref%:*}"
    fi
  fi
  echo "$ref"
}

backup_state() {
  local prefix="$1"
  local prev_image="$2" prev_tag="$3" prev_id="$4"
  PREV_IMAGE_REF="$prev_image" PREV_IMAGE_TAG="$prev_tag" PREV_IMAGE_ID="$prev_id" PREFIX_IN="$prefix" node - <<'NODE' > "$BACKUPS_DIR/${prefix}-state.json"
const fs=require('fs');
const o={prefix:process.env.PREFIX_IN,createdAt:new Date().toISOString(),prev:{image:process.env.PREV_IMAGE_REF||'',tag:process.env.PREV_IMAGE_TAG||'',id:process.env.PREV_IMAGE_ID||''}};
process.stdout.write(JSON.stringify(o,null,2));
NODE
}

do_backup() {
  local prefix="$1"
  log "F4.4: iniciando backup verificado (prefijo ${prefix})"
  mkdir -p "$BACKUPS_DIR"

  # 1) DB dump comprimido
  local db_user db_name dump_file
  db_user="${POSTGRES_USER:-${DB_USERNAME:-admin}}"
  db_name="${POSTGRES_DB:-${DB_NAME:-erp_database}}"
  dump_file="$BACKUPS_DIR/${prefix}-db.sql.gz"
  log "F4.4: ejecutando pg_dump (db=${db_name}) -> ${dump_file##*/}"
  # no loguear credenciales
  if ! compose exec -T db pg_dump -U "$db_user" -d "$db_name" --no-owner --no-acl | gzip -c > "$dump_file"; then
    log_err "F4.4: pg_dump falló"
    rm -f "$dump_file"
    return 1
  fi
  if [[ ! -s "$dump_file" ]]; then
    log_err "F4.4: archivo de dump vacío o no creado"
    return 1
  fi

  # 2) copia license y .env
  if [[ -d "$LICENSE_DIR" ]]; then
    tar -czf "$BACKUPS_DIR/${prefix}-license.tar.gz" -C "$DEPLOY_DIR" "$(basename "$LICENSE_DIR")"
  else
    mkdir -p "$LICENSE_DIR"
    tar -czf "$BACKUPS_DIR/${prefix}-license.tar.gz" -C "$DEPLOY_DIR" "$(basename "$LICENSE_DIR")"
    log_warn "F4.4: directorio license no existía; se respaldó vacío"
  fi
  [[ -s "$BACKUPS_DIR/${prefix}-license.tar.gz" ]] || { log_err "F4.4: respaldo de license inválido"; return 1; }

  cp "$ENV_FILE" "$BACKUPS_DIR/${prefix}-.env"
  [[ -s "$BACKUPS_DIR/${prefix}-.env" ]] || { log_err "F4.4: respaldo de .env inválido"; return 1; }

  if [[ -f "$COMPOSE_FILE" ]]; then
    cp "$COMPOSE_FILE" "$BACKUPS_DIR/${prefix}-compose.yml"
  fi

  log "F4.4: backup completado y verificado (db, license, .env, compose)"
  return 0
}

update_env_image_tag() {
  local new_tag="$1" env_target="$2"
  # reemplazo controlado de APP_IMAGE_TAG=... (solo esa clave)
  if grep -q '^APP_IMAGE_TAG=' "$env_target"; then
    sed -i.bak -E "s|^APP_IMAGE_TAG=.*|APP_IMAGE_TAG=${new_tag}|" "$env_target" && rm -f "${env_target}.bak"
  else
    printf '\nAPP_IMAGE_TAG=%s\n' "$new_tag" >> "$env_target"
  fi
}

restore_env_from_backup() {
  local prefix="$1"
  if [[ -f "$BACKUPS_DIR/${prefix}-.env" ]]; then
    cp "$BACKUPS_DIR/${prefix}-.env" "$ENV_FILE"
    log "Rollback: .env restaurado desde backup ${prefix}"
    return 0
  fi
  log_err "Rollback: no se encontró backup de .env (${prefix})"
  return 1
}

restore_db_from_backup() {
  local prefix="$1"
  local db_user db_name dump_file
  db_user="${POSTGRES_USER:-${DB_USERNAME:-admin}}"
  db_name="${POSTGRES_DB:-${DB_NAME:-erp_database}}"
  dump_file="$BACKUPS_DIR/${prefix}-db.sql.gz"
  if [[ ! -s "$dump_file" ]]; then
    log_err "Restore DB: dump no encontrado o vacío ($dump_file)"
    return 1
  fi
  log "Rollback/restore: restaurando base de datos desde ${dump_file##*/} (operación destructiva controlada)"
  # Estrategia segura: drop/recreate schema public + restore (compose db). Mantener app detenida.
  if ! compose exec -T db psql -v ON_ERROR_STOP=1 -U "$db_user" -d "$db_name" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"; then
    log_err "Restore DB: fallo al limpiar esquema public"
    return 1
  fi
  if ! gzip -dc "$dump_file" | compose exec -T db psql -v ON_ERROR_STOP=1 -U "$db_user" -d "$db_name"; then
    log_err "Restore DB: fallo al importar dump"
    return 1
  fi
  log "Restore DB: completado desde backup ${prefix}"
  return 0
}

check_health() {
  local port url attempt
  port="${APP_PORT:-3000}"
  url="http://localhost:${port}/health"
  attempt=1
  while [[ $attempt -le $HEALTH_RETRIES ]]; do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      log "Smoke /health OK (intento ${attempt}/${HEALTH_RETRIES})"
      return 0
    fi
    log "Smoke /health pendiente (intento ${attempt}/${HEALTH_RETRIES})..."
    sleep "$HEALTH_DELAY_SEC"
    attempt=$((attempt + 1))
  done
  log_err "Smoke /health falló tras ${HEALTH_RETRIES} intentos (${url})"
  return 1
}

main() {
  log "===== Inicio nightly-update (dry_run=${DRY_RUN} no_wait=${NO_WAIT}) ====="
  log "Deploy dir: $DEPLOY_DIR | Compose: $COMPOSE_FILE"

  require_cmd docker
  require_cmd node
  require_cmd curl
  require_cmd gzip
  require_cmd tar
  require_cmd date
  require_cmd sed
  require_cmd grep

  [[ -f "$COMPOSE_FILE" ]] || { log_err "No se encontró compose: $COMPOSE_FILE"; exit 1; }
  [[ -f "$ENV_FILE" ]] || { log_err "No se encontró .env: $ENV_FILE"; exit 1; }
  [[ -f "$SCRIPT_DIR/release-manifest.mjs" ]] || { log_err "Falta helper: $SCRIPT_DIR/release-manifest.mjs"; exit 1; }

  load_env
  resolve_compose_cmd
  acquire_lock
  sleep_until_window_and_jitter

  # F4.3: consultar y verificar manifiesto firmado
  log "F4.3: consultando releases/latest y verificando firma RS256 del manifiesto"
  export HTTP_TIMEOUT_MS
  local manifest_json status reason
  set +e
  manifest_json=$(node "$SCRIPT_DIR/release-manifest.mjs" fetch-verify 2>>"$LOG_FILE")
  local helper_rc=$?
  set -e
  status="$(json_get "$manifest_json" status)"
  reason="$(json_get "$manifest_json" reason)"
  if [[ "$status" == "noop" ]]; then
    log "F4.3: sin actualización aplicable. Motivo: ${reason:-n/a}. (evento registrado, sin cambios)"
    exit 0
  fi
  if [[ "$status" != "ok" || $helper_rc -ne 0 ]]; then
    log_err "F4.3: verificación/consulta inválida o rechazada. Motivo: ${reason:-desconocido}. Abortando sin aplicar cambios."
    exit 4
  fi

  local new_version image_ref image_digest image_digest_norm
  new_version="$(json_get "$manifest_json" version)"
  image_ref="$(json_get "$manifest_json" image_ref)"
  image_digest="$(json_get "$manifest_json" image_digest_sha256)"
  image_digest_norm="$(normalize_digest "$image_digest")"
  local app_image_base pinned_ref
  app_image_base="${APP_IMAGE:-$(extract_repo "$image_ref")}"
  app_image_base="$(extract_repo "$app_image_base")"
  pinned_ref="${app_image_base}@${image_digest_norm}"

  log "F4.3: manifiesto firmado y válido. Nueva versión=${new_version} canal=${UPDATE_CHANNEL:-stable} (digest verificado)."
  log "F4.3: imagen pinneada objetivo: ${app_image_base}@<digest-verificado>"

  if [[ $DRY_RUN -eq 1 ]]; then
    log "DRY-RUN: se omiten F4.4/F4.5/F4.6 (sin backup, sin pull, sin apply/migrate). Verificación OK."
    log "DRY-RUN: aplicaría version=${new_version} image_ref=${image_ref} migration_bundle_hash=$(json_get "$manifest_json" migration_bundle_hash) compose_hash=$(json_get "$manifest_json" compose_hash)"
    exit 0
  fi

  # Estado previo para rollback
  local prev_tag prev_image prev_id prefix
  prev_tag="${APP_IMAGE_TAG:-latest}"
  prev_image="${APP_IMAGE:-$app_image_base}"
  prev_id="$(compose images -q app 2>/dev/null | head -1 || true)"
  if [[ -z "$prev_id" ]]; then prev_id="$(docker inspect --format='{{.Id}}' "${prev_image}:${prev_tag}" 2>/dev/null || true)"; fi
  prefix="update-$(date +%Y%m%d-%H%M%S)-$$"
  backup_state "$prefix" "$prev_image" "$prev_tag" "$prev_id"
  log "Estado previo registrado: tag=${prev_tag} id=${prev_id:-desconocido}"

  # F4.4: backup y pull por digest
  if ! do_backup "$prefix"; then
    log_err "F4.4: backup no exitoso. Abortando sin aplicar cambios."
    exit 5
  fi

  log "F4.4: pull estricto por digest firmado"
  if ! docker pull "$pinned_ref"; then
    log_err "F4.4: docker pull por digest falló. Abortando (sin cambios aplicados; backup disponible ${prefix})."
    exit 6
  fi
  # Tag local controlado a la versión objetivo (contenido ya verificado por digest)
  if ! docker tag "$pinned_ref" "${app_image_base}:${new_version}"; then
    log_err "F4.4: no se pudo etiquetar imagen localmente. Abortando."
    exit 6
  fi
  log "F4.4: imagen verificada descargada y etiquetada localmente para versión ${new_version}"

  # F4.5: apply & migrate
  local migration_attempted=0
  local apply_ok=0
  local restore_required=0
  local fail_phase=""

  rollback() {
    local why="$1"
    log_err "F4.6: fallo detectado (${why}). Iniciando rollback automático."
    # detener app afectada
    compose stop app >/dev/null 2>&1 || true
    compose rm -f app >/dev/null 2>&1 || true

    if [[ $migration_attempted -eq 1 ]]; then
      # migración pudo haber corrido/fallado parcialmente: DB incierta según evidencia
      log_err "F4.6: migration_attempted=1. Intentando restore de DB desde backup verificado (${prefix})."
      if restore_db_from_backup "$prefix"; then
        log "F4.6: restore de DB completado."
      else
        restore_required=1
        log_err "F4.6: RESTORE REQUERIDO - fallo al restaurar DB automáticamente (backup: ${prefix})."
      fi
    else
      log "F4.6: no se intentó migración; rollback app-only (sin restore de DB)."
    fi

    # revertir imagen/config
    restore_env_from_backup "$prefix" || restore_required=1
    if [[ -n "$prev_id" ]]; then
      docker tag "$prev_id" "${app_image_base}:${prev_tag}" >/dev/null 2>&1 || log_warn "F4.6: no se pudo re-etiquetar imagen previa por id"
    fi
    log "F4.6: levantando versión/configuración previa"
    compose up -d app >/dev/null 2>&1 || log_err "F4.6: fallo al levantar app previa"
    if check_health; then
      log "F4.6: health básico OK tras rollback a versión previa."
    else
      log_err "F4.6: health básico no confirmado tras rollback."
      [[ $migration_attempted -eq 1 ]] && restore_required=1
    fi

    if [[ $restore_required -eq 1 || $migration_attempted -eq 1 ]]; then
      log_err "F4.6: RESTORE REQUERIDO - verificar integridad de esquema/datos y consistencia con imagen previa (backup verificado: ${prefix})."
    else
      log "F4.6: rollback app-only completado (sin indicios de cambio de esquema)."
    fi
  }

  log "F4.5: actualizando referencia de imagen en .env a versión ${new_version} (pin por digest aplicado)"
  update_env_image_tag "$new_version" "$ENV_FILE"

  log "F4.5: aplicando nueva imagen (compose up -d app)"
  if ! compose up -d app; then
    fail_phase="compose-up"
    rollback "$fail_phase"
    exit 7
  fi

  log "F4.5: ejecutando migraciones (npm run migration:run, TYPEORM_SYNCHRONIZE=false)"
  migration_attempted=1
  if ! compose exec -T app npm run migration:run; then
    fail_phase="migration-run"
    restore_required=1
    rollback "$fail_phase"
    exit 8
  fi
  log "F4.5: migraciones ejecutadas correctamente"

  log "F4.6: smoke test /health"
  if ! check_health; then
    fail_phase="health-smoke"
    # health falló tras migración: estado potencialmente inconsistente
    restore_required=1
    rollback "$fail_phase"
    exit 9
  fi

  apply_ok=1
  log "Actualización completada OK: version=${new_version} (digest verificado). Backup: ${prefix}"
  log "===== Fin nightly-update OK ====="
  exit 0
}

main "$@"
