#!/usr/bin/env bash
set -euo pipefail

# Instalador on-prem (F3.1) - Sistema Aserradero
# Idempotente: crea carpetas, genera .env si falta o se confirma, sin sobrescribir sin confirmación.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

say() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
err() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

rand_pass() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 24 | tr -d '\n' | tr '/+' 'Az' | cut -c1-24
  else
    head -c 18 /dev/urandom | base64 | tr -d '\n' | tr '/+' 'Az' | cut -c1-24
  fi
}

confirm() {
  local prompt="$1"
  local reply
  read -r -p "$prompt [y/N]: " reply || true
  [[ "${reply:-}" =~ ^[Yy]$ ]]
}

check_docker() {
  command -v docker >/dev/null 2>&1 || err "Docker no está instalado o no está en PATH."
  docker info >/dev/null 2>&1 || err "Docker daemon no disponible. Inicie Docker y reintente."
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    err "Docker Compose v2 ('docker compose') o docker-compose no encontrado."
  fi
  say "Docker OK. Compose: ${COMPOSE_CMD[*]}"
}

ensure_dirs() {
  mkdir -p dbdata backups license
  # Hardening base: permisos estructurales de volúmenes (estado sensible / respaldos)
  chmod 700 license 2>/dev/null || true
  chmod 750 backups dbdata 2>/dev/null || true
  say "Directorios verificados/creados: ./dbdata ./backups ./license (permisos endurecidos best-effort)"
}

write_env() {
  local envfile=".env"
  if [[ -f "$envfile" ]]; then
    if ! confirm "$envfile ya existe. ¿Sobrescribir?"; then
      say "Conservando $envfile existente."
      return 0
    fi
    cp "$envfile" "$envfile.bak.$(date +%Y%m%d%H%M%S)" || true
    say "Backup creado del .env previo."
  fi

  say "Configuración inicial (.env). Enter para aceptar valor por defecto cuando aplique."

  local db_user db_name db_pass jwt_secret app_port tz
  read -r -p "DB/POSTGRES usuario [admin]: " db_user || true; db_user="${db_user:-admin}"
  read -r -p "DB/POSTGRES nombre base [erp_database]: " db_name || true; db_name="${db_name:-erp_database}"
  db_pass="$(rand_pass)"
  jwt_secret="$(rand_hex)$(rand_hex)"
  read -r -p "Puerto aplicación APP_PORT [3000]: " app_port || true; app_port="${app_port:-3000}"
  read -r -p "Zona horaria TZ [America/Argentina/Buenos_Aires]: " tz || true; tz="${tz:-America/Argentina/Buenos_Aires}"

  local ghcr_owner app_image app_image_tag
  read -r -p "GHCR owner/org para imagen [OWNER]: " ghcr_owner || true; ghcr_owner="${ghcr_owner:-OWNER}"
  app_image="ghcr.io/${ghcr_owner}/erp-todo-pallets"
  read -r -p "APP_IMAGE [${app_image}]: " app_image_in || true; app_image="${app_image_in:-$app_image}"
  read -r -p "APP_IMAGE_TAG (tag o @sha256:digest) [latest]: " app_image_tag || true; app_image_tag="${app_image_tag:-latest}"

  local license_url enforcement channel
  # Piloto F5: defaults seguros (no auto-update estricto). URL prod configurable.
  read -r -p "LICENSE_SERVER_URL [https://licencias.example.com]: " license_url || true; license_url="${license_url:-https://licencias.example.com}"
  read -r -p "LICENSE_ENFORCEMENT [grace]: " enforcement || true; enforcement="${enforcement:-grace}"
  read -r -p "UPDATE_CHANNEL [stable]: " channel || true; channel="${channel:-stable}"

  local admin_email admin_pass gen_admin
  read -r -p "Email admin inicial (INSTALL_ADMIN_EMAIL, opcional): " admin_email || true; admin_email="${admin_email:-}"
  admin_pass=""
  if [[ -n "$admin_email" ]]; then
    read -r -p "Generar contraseña admin segura automáticamente? [Y/n]: " gen_admin || true
    if [[ -z "${gen_admin:-}" || "${gen_admin}" =~ ^[Yy]$ ]]; then
      admin_pass="$(rand_pass)"
      ADMIN_PASS_GENERATED="1"
    else
      read -r -s -p "Contraseña admin inicial (no se mostrará): " admin_pass || true; echo
      ADMIN_PASS_GENERATED="0"
    fi
  else
    ADMIN_PASS_GENERATED="0"
  fi

  umask 077
  # Clave pública RSA productiva pinneada (Pilar 1, kid prod-20261111). Sin claves privadas.
  local license_pubkey_pem='-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA/haJWv8Qy5YJwT/gZKrB\nVJ2snwn1y3xoRoRz6QQu2sRuT5S/8lag8cm6OjfiOUTi/pXGyPv8hNYiPuEbI50v\na3kUovqOgWJbXo0HNX6dcphm41Z5p4pG9V8ZxFg383ju7NpgxL2QH5n+iTkr2fNp\n5iNepo26P6vDjW8G/0hwzH7X+AbD3/rlfOMUqXj3BosfSqtmBh7S7w3R1nt3dxHo\nJijaJ2jg9TprP+TSrr+bRqQFa+jlSW4ybUHikC3vDhCDDL6Vf8oa6rzW3TMxV9IO\nGN9MpLgAJNf4xIJmzLZf0HJ7WzE6sLKX3Oocd2VX3e4RlV3zjSdL/mtN/bgo48tp\nIbWsp2bBqA2XGfvpRSDDHGslIbbfvDI1g65nf8dOHmxsyGokCOE4AlpuBSo2BjUk\nLI/ioy81C5eSYuN+zUbsGwzxzcf4AEU59upMZ6lFCcADutTCjk3pNSxQ9NSMCFve\nqMTnos6BrGKmMzVGYUR7EHof+hP5IsrzmzeQEwoEYm8ATdyjzPRgJBH37dqecrSz\nqhiN7pJH4qd0h4Zdb8JbwDv8wRk8QIv+eHK+7zZTr/er77VMDZ9Wj9E910KMM8VD\nXSTd7UQ9HfycIyZwvZtBGBGmzdC0Q/cD7U8pYO13FW4M/3l/lDeKCtEkNf4ovU3S\n18uNU/XDvuX9kJQAlwNDRAMCAwEAAQ==\n-----END PUBLIC KEY-----'

  cat > "$envfile" <<EOF
# Generado por deploy/install.sh (F3.1/F5 piloto). No commitear. Permisos restringidos recomendados.
# Piloto: LICENSE_ENFORCEMENT=grace, UPDATES_AUTO_ENABLED=false (no auto-update estricto).
# Base de datos
DB_HOST=db
DB_PORT=5432
DB_USERNAME=${db_user}
DB_PASSWORD=${db_pass}
DB_NAME=${db_name}
POSTGRES_USER=${db_user}
POSTGRES_PASSWORD=${db_pass}
POSTGRES_DB=${db_name}

# App
PORT=3000
APP_PORT=${app_port}
BACKUP_DIRECTORY=/backups
TZ=${tz}
TYPEORM_SYNCHRONIZE=false
JWT_SECRET=${jwt_secret}

# Imagen (GHCR, F3.2) - usar tag o @sha256:digest en APP_IMAGE_TAG según despliegue
APP_IMAGE=${app_image}
APP_IMAGE_TAG=${app_image_tag}

# Licenciamiento / updates (Pilar 2, producción)
APP_VERSION=0.0.1
LICENSE_SERVER_URL=${license_url}
LICENSE_PUBLIC_KEY_PEM="${license_pubkey_pem}"
LICENSE_ENFORCEMENT=${enforcement}
LICENSE_CHECK_INTERVAL_MS=86400000
LICENSE_GRACE_HOURS=72
LICENSE_STATE_PATH=/app/license
LICENSE_CLOCK_SKEW_SEC=300
UPDATE_CHANNEL=${channel}
UPDATES_AUTO_ENABLED=false

# Bootstrap admin one-shot (F3.3, opcional)
INSTALL_ADMIN_EMAIL=${admin_email}
INSTALL_ADMIN_PASSWORD=${admin_pass}
INSTALL_ADMIN_GENERATE_PASSWORD=false
EOF

  chmod 600 "$envfile" 2>/dev/null || true
  say ".env generado en $SCRIPT_DIR/.env (permisos 600 si fue posible)."

  if [[ -n "$admin_email" && "${ADMIN_PASS_GENERATED:-0}" == "1" ]]; then
    say "------------------------------------------------------------"
    say "ADMIN INICIAL (mostrar una sola vez, guárdelo ahora):"
    say "  Email: ${admin_email}"
    say "  Contraseña: ${admin_pass}"
    say "------------------------------------------------------------"
  elif [[ -n "$admin_email" ]]; then
    say "Credenciales admin inicial configuradas en .env (no mostradas)."
  fi
}

main() {
  say "== Instalador Sistema Aserradero (F3.1) =="
  check_docker
  ensure_dirs
  write_env
  say "Listo. Siguiente: revise .env (LICENSE_PUBLIC_KEY_PEM, LICENSE_SERVER_URL) y ejecute:"
  say "  ${COMPOSE_CMD[*]} -f docker-compose.prod.yml --env-file .env up -d"
  say "Verifique: curl -fsS http://localhost:\${APP_PORT:-3000}/health"
}

main "$@"
