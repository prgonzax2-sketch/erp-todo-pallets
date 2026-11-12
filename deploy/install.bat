@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Instalador on-prem (F3.1) - Sistema Aserradero (Windows)
REM Idempotente: crea carpetas y genera .env si falta o se confirma.

cd /d "%~dp0"

echo == Instalador Sistema Aserradero (F3.1, Windows) ==

where docker >nul 2>nul
if errorlevel 1 (
  echo ERROR: Docker no esta instalado o no esta en PATH.
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo ERROR: Docker daemon no disponible. Inicie Docker Desktop y reintente.
  exit /b 1
)

set "COMPOSE_CMD=docker compose"
docker compose version >nul 2>nul
if errorlevel 1 (
  where docker-compose >nul 2>nul
  if errorlevel 1 (
    echo ERROR: Docker Compose v2 ^('docker compose'^) o docker-compose no encontrado.
    exit /b 1
  )
  set "COMPOSE_CMD=docker-compose"
)
echo Docker OK. Compose: %COMPOSE_CMD%

if not exist "dbdata" mkdir "dbdata"
if not exist "backups" mkdir "backups"
if not exist "license" mkdir "license"
REM Hardening base (permisos estructurales best-effort en Windows/NTFS)
icacls "license" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" >nul 2>nul
icacls "backups" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)M" >nul 2>nul
icacls "dbdata" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)M" >nul 2>nul
echo Directorios verificados/creados: .\dbdata .\backups .\license (permisos endurecidos best-effort)

if exist ".env" (
  set /p OVERWRITE=.env ya existe. Sobrescribir? [y/N]: 
  if /I not "!OVERWRITE!"=="y" (
    echo Conservando .env existente.
    goto :done
  )
  for /f "tokens=1-4 delims=/:. " %%a in ("%date% %time%") do set "TS=%%d%%b%%c%%a"
  copy /y ".env" ".env.bak.!TS!" >nul 2>nul
  echo Backup creado del .env previo.
)

echo Configuracion inicial (.env). Enter para aceptar valor por defecto cuando aplique.

set "DB_USER=admin"
set /p DB_USER=DB/POSTGRES usuario [admin]: 
if "!DB_USER!"=="" set "DB_USER=admin"

set "DB_NAME=erp_database"
set /p DB_NAME=DB/POSTGRES nombre base [erp_database]: 
if "!DB_NAME!"=="" set "DB_NAME=erp_database"

set "APP_PORT=3000"
set /p APP_PORT=Puerto aplicacion APP_PORT [3000]: 
if "!APP_PORT!"=="" set "APP_PORT=3000"

set "TZ=America/Argentina/Buenos_Aires"
set /p TZ=Zona horaria TZ [America/Argentina/Buenos_Aires]: 
if "!TZ!"=="" set "TZ=America/Argentina/Buenos_Aires"

set "GHCR_OWNER=OWNER"
set /p GHCR_OWNER=GHCR owner/org para imagen [OWNER]: 
if "!GHCR_OWNER!"=="" set "GHCR_OWNER=OWNER"

set "APP_IMAGE=ghcr.io/%GHCR_OWNER%/erp-todo-pallets"
set /p APP_IMAGE=APP_IMAGE [%APP_IMAGE%]: 
if "!APP_IMAGE!"=="" set "APP_IMAGE=ghcr.io/%GHCR_OWNER%/erp-todo-pallets"

set "APP_IMAGE_TAG=latest"
set /p APP_IMAGE_TAG=APP_IMAGE_TAG (tag o @sha256:digest) [latest]: 
if "!APP_IMAGE_TAG!"=="" set "APP_IMAGE_TAG=latest"

set "LICENSE_URL=https://licencias.example.com"
set /p LICENSE_URL=LICENSE_SERVER_URL [https://licencias.example.com]: 
if "!LICENSE_URL!"=="" set "LICENSE_URL=https://licencias.example.com"

set "ENFORCEMENT=grace"
set /p ENFORCEMENT=LICENSE_ENFORCEMENT [grace]: 
if "!ENFORCEMENT!"=="" set "ENFORCEMENT=grace" REM Piloto F5: no strict auto-update

set "CHANNEL=stable"
set /p CHANNEL=UPDATE_CHANNEL [stable]: 
if "!CHANNEL!"=="" set "CHANNEL=stable"

set "ADMIN_EMAIL="
set /p ADMIN_EMAIL=Email admin inicial (INSTALL_ADMIN_EMAIL, opcional): 

set "ADMIN_PASS="
set "ADMIN_PASS_GENERATED=0"
if not "!ADMIN_EMAIL!"=="" (
  set "GEN_ADMIN=Y"
  set /p GEN_ADMIN=Generar contrasena admin segura automaticamente? [Y/n]: 
  if /I "!GEN_ADMIN!"=="n" (
    set /p ADMIN_PASS=Contrasena admin inicial: 
  ) else (
    for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$c='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#_-'; -join(1..24 | ForEach-Object { $c[(Get-Random -Maximum $c.Length)] })"`) do set "ADMIN_PASS=%%P"
    set "ADMIN_PASS_GENERATED=1"
  )
)

for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "[Convert]::ToBase64String((1..48|%%{[byte](Get-Random -Max 256)})) -replace '[+/=]','A' | %%{ $_.Substring(0,[Math]::Min(48,$_.Length)) }"`) do set "JWT_SECRET=%%S"
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Convert]::ToBase64String((1..24|%%{[byte](Get-Random -Max 256)})) -replace '[+/=]','x' | %%{ $_.Substring(0,[Math]::Min(24,$_.Length)) }"`) do set "DB_PASS=%%P"

set "LICENSE_PUBKEY_PEM=-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA/haJWv8Qy5YJwT/gZKrB\nVJ2snwn1y3xoRoRz6QQu2sRuT5S/8lag8cm6OjfiOUTi/pXGyPv8hNYiPuEbI50v\na3kUovqOgWJbXo0HNX6dcphm41Z5p4pG9V8ZxFg383ju7NpgxL2QH5n+iTkr2fNp\n5iNepo26P6vDjW8G/0hwzH7X+AbD3/rlfOMUqXj3BosfSqtmBh7S7w3R1nt3dxHo\nJijaJ2jg9TprP+TSrr+bRqQFa+jlSW4ybUHikC3vDhCDDL6Vf8oa6rzW3TMxV9IO\nGN9MpLgAJNf4xIJmzLZf0HJ7WzE6sLKX3Oocd2VX3e4RlV3zjSdL/mtN/bgo48tp\nIbWsp2bBqA2XGfvpRSDDHGslIbbfvDI1g65nf8dOHmxsyGokCOE4AlpuBSo2BjUk\nLI/ioy81C5eSYuN+zUbsGwzxzcf4AEU59upMZ6lFCcADutTCjk3pNSxQ9NSMCFve\nqMTnos6BrGKmMzVGYUR7EHof+hP5IsrzmzeQEwoEYm8ATdyjzPRgJBH37dqecrSz\nqhiN7pJH4qd0h4Zdb8JbwDv8wRk8QIv+eHK+7zZTr/er77VMDZ9Wj9E910KMM8VD\nXSTd7UQ9HfycIyZwvZtBGBGmzdC0Q/cD7U8pYO13FW4M/3l/lDeKCtEkNf4ovU3S\n18uNU/XDvuX9kJQAlwNDRAMCAwEAAQ==\n-----END PUBLIC KEY-----"

(
echo # Generado por deploy/install.bat ^(F3.1/F5 piloto^). No commitear.
echo # Piloto: LICENSE_ENFORCEMENT=grace, UPDATES_AUTO_ENABLED=false ^(no auto-update estricto^).
echo # Base de datos
echo DB_HOST=db
echo DB_PORT=5432
echo DB_USERNAME=!DB_USER!
echo DB_PASSWORD=!DB_PASS!
echo DB_NAME=!DB_NAME!
echo POSTGRES_USER=!DB_USER!
echo POSTGRES_PASSWORD=!DB_PASS!
echo POSTGRES_DB=!DB_NAME!
echo.
echo # App
echo PORT=3000
echo APP_PORT=!APP_PORT!
echo BACKUP_DIRECTORY=/backups
echo TZ=!TZ!
echo TYPEORM_SYNCHRONIZE=false
echo JWT_SECRET=!JWT_SECRET!
echo.
echo # Imagen ^(GHCR, F3.2^)
echo APP_IMAGE=!APP_IMAGE!
echo APP_IMAGE_TAG=!APP_IMAGE_TAG!
echo.
echo # Licenciamiento / updates ^(Pilar 2, produccion^)
echo APP_VERSION=0.0.1
echo LICENSE_SERVER_URL=!LICENSE_URL!
echo LICENSE_PUBLIC_KEY_PEM="!LICENSE_PUBKEY_PEM!"
echo LICENSE_ENFORCEMENT=!ENFORCEMENT!
echo LICENSE_CHECK_INTERVAL_MS=86400000
echo LICENSE_GRACE_HOURS=72
echo LICENSE_STATE_PATH=/app/license
echo LICENSE_CLOCK_SKEW_SEC=300
echo UPDATE_CHANNEL=!CHANNEL!
echo UPDATES_AUTO_ENABLED=false
echo.
echo # Bootstrap admin one-shot ^(F3.3, opcional^)
echo INSTALL_ADMIN_EMAIL=!ADMIN_EMAIL!
echo INSTALL_ADMIN_PASSWORD=!ADMIN_PASS!
echo INSTALL_ADMIN_GENERATE_PASSWORD=false
) > ".env"

echo .env generado en %cd%\.env
if "!ADMIN_PASS_GENERATED!"=="1" (
  echo ------------------------------------------------------------
  echo ADMIN INICIAL ^(mostrar una sola vez, guardelo ahora^):
  echo   Email: !ADMIN_EMAIL!
  echo   Contrasena: !ADMIN_PASS!
  echo ------------------------------------------------------------
) else if not "!ADMIN_EMAIL!"=="" (
  echo Credenciales admin inicial configuradas en .env ^(no mostradas^).
)

:done
echo Listo. Revise .env y ejecute:
echo   %COMPOSE_CMD% -f docker-compose.prod.yml --env-file .env up -d
echo Verifique: curl -fsS http://localhost:%APP_PORT%/health
endlocal
exit /b 0
