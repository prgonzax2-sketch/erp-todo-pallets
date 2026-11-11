@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM nightly-update.bat — Agente de actualización nocturna (Pilar 3b, F4.2–F4.6, D6/D10)
REM Requisitos: Docker Desktop/Engine con Compose v2, Node.js, curl, tar, PowerShell.
REM Uso:
REM   scripts\nightly-update.bat [--now^|--no-wait] [--dry-run] [--deploy-dir <dir>] [--compose-file <file>] [--log-file <file>]
REM Env (deploy\.env): LICENSE_SERVER_URL, LICENSE_PUBLIC_KEY_PEM, APP_VERSION, UPDATE_CHANNEL,
REM   APP_IMAGE, APP_IMAGE_TAG, POSTGRES/DB creds, APP_PORT.
REM Opcionales: UPDATE_WINDOW_TIME=03:00, UPDATE_JITTER_MAX_SEC=1800, UPDATE_LOCK_STALE_SEC=21600,
REM   UPDATE_HTTP_TIMEOUT_MS=15000, UPDATE_HEALTH_RETRIES=12, UPDATE_HEALTH_DELAY_SEC=5.

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "REPO_ROOT=%%~fI"

set "NO_WAIT=0"
set "DRY_RUN=0"
set "DEPLOY_DIR_ARG="
set "COMPOSE_FILE_ARG="
set "LOG_FILE_ARG="

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--now" (set "NO_WAIT=1" & shift & goto :parse_args)
if /I "%~1"=="--no-wait" (set "NO_WAIT=1" & shift & goto :parse_args)
if /I "%~1"=="--dry-run" (set "DRY_RUN=1" & shift & goto :parse_args)
if /I "%~1"=="--deploy-dir" (set "DEPLOY_DIR_ARG=%~2" & shift & shift & goto :parse_args)
if /I "%~1"=="--compose-file" (set "COMPOSE_FILE_ARG=%~2" & shift & shift & goto :parse_args)
if /I "%~1"=="--log-file" (set "LOG_FILE_ARG=%~2" & shift & shift & goto :parse_args)
if /I "%~1"=="--help" goto :usage
if /I "%~1"=="-h" goto :usage
echo Argumento desconocido: %~1
exit /b 2

:usage
echo Uso: %~nx0 [--now^|--no-wait] [--dry-run] [--deploy-dir dir] [--compose-file file] [--log-file file]
echo   --now/--no-wait  Omite espera de ventana y jitter
echo   --dry-run        Solo verificacion F4.2/F4.3 (sin backup/pull/apply)
exit /b 0

:args_done
if defined DEPLOY_DIR_ARG (
  set "DEPLOY_DIR=%DEPLOY_DIR_ARG%"
) else if defined DEPLOY_DIR (
  rem keep env DEPLOY_DIR
) else if exist "%CD%\docker-compose.prod.yml" if exist "%CD%\.env" (
  set "DEPLOY_DIR=%CD%"
) else if exist "%REPO_ROOT%\deploy\docker-compose.prod.yml" (
  set "DEPLOY_DIR=%REPO_ROOT%\deploy"
) else (
  set "DEPLOY_DIR=%CD%"
)
for %%I in ("%DEPLOY_DIR%") do set "DEPLOY_DIR=%%~fI"

if defined COMPOSE_FILE_ARG (set "COMPOSE_FILE=%COMPOSE_FILE_ARG%") else if defined COMPOSE_FILE (rem keep) else set "COMPOSE_FILE=%DEPLOY_DIR%\docker-compose.prod.yml"
for %%I in ("%COMPOSE_FILE%") do set "COMPOSE_FILE=%%~fI"

set "ENV_FILE=%DEPLOY_DIR%\.env"
set "BACKUPS_DIR=%DEPLOY_DIR%\backups"
set "LICENSE_DIR=%DEPLOY_DIR%\license"
if not exist "%BACKUPS_DIR%" mkdir "%BACKUPS_DIR%" >nul 2>nul

if defined LOG_FILE_ARG (set "LOG_FILE=%LOG_FILE_ARG%") else if defined LOG_FILE (rem keep) else set "LOG_FILE=%BACKUPS_DIR%\update-agent.log"
for %%I in ("%LOG_FILE%") do set "LOG_FILE=%%~fI"

set "LOCK_FILE=%BACKUPS_DIR%\.nightly-update.lock"
if not defined UPDATE_LOCK_STALE_SEC set "UPDATE_LOCK_STALE_SEC=21600"
if not defined UPDATE_WINDOW_TIME set "UPDATE_WINDOW_TIME=03:00"
if not defined UPDATE_JITTER_MAX_SEC set "UPDATE_JITTER_MAX_SEC=1800"
if not defined UPDATE_HTTP_TIMEOUT_MS set "UPDATE_HTTP_TIMEOUT_MS=15000"
if not defined UPDATE_HEALTH_RETRIES set "UPDATE_HEALTH_RETRIES=12"
if not defined UPDATE_HEALTH_DELAY_SEC set "UPDATE_HEALTH_DELAY_SEC=5"

call :log "===== Inicio nightly-update (dry_run=%DRY_RUN% no_wait=%NO_WAIT%) ====="
call :log "Deploy dir: %DEPLOY_DIR% | Compose: %COMPOSE_FILE%"

where docker >nul 2>nul || (call :log_err "Docker no encontrado" & exit /b 1)
where node >nul 2>nul || (call :log_err "Node.js no encontrado" & exit /b 1)
where curl >nul 2>nul || (call :log_err "curl no encontrado" & exit /b 1)
where tar >nul 2>nul || (call :log_err "tar no encontrado" & exit /b 1)
if not exist "%COMPOSE_FILE%" (call :log_err "No se encontro compose: %COMPOSE_FILE%" & exit /b 1)
if not exist "%ENV_FILE%" (call :log_err "No se encontro .env: %ENV_FILE%" & exit /b 1)
if not exist "%SCRIPT_DIR%\release-manifest.mjs" (call :log_err "Falta helper: %SCRIPT_DIR%\release-manifest.mjs" & exit /b 1)

set "COMPOSE_CMD=docker compose"
docker compose version >nul 2>nul
if errorlevel 1 (
  where docker-compose >nul 2>nul
  if errorlevel 1 (call :log_err "Docker Compose no encontrado" & exit /b 1)
  set "COMPOSE_CMD=docker-compose"
)

call :load_env "%ENV_FILE%"
if errorlevel 1 (call :log_err "No se pudo cargar .env" & exit /b 1)

call :acquire_lock
if errorlevel 1 exit /b 3

call :wait_window_jitter

REM F4.3 verificacion manifiesto
call :log "F4.3: consultando releases/latest y verificando firma RS256 del manifiesto"
set "MANIFEST_JSON_FILE=%BACKUPS_DIR%\_manifest-check-%RANDOM%%RANDOM%.json"
node "%SCRIPT_DIR%\release-manifest.mjs" fetch-verify > "%MANIFEST_JSON_FILE%" 2>>"%LOG_FILE%"
set "HELPER_RC=%ERRORLEVEL%"

for /f "usebackq delims=" %%S in (`node -e "try{const o=require('fs').readFileSync(process.argv[1],'utf8');const j=JSON.parse(o);process.stdout.write(j.status||'')}catch(e){process.stdout.write('error')}" "%MANIFEST_JSON_FILE%"`) do set "M_STATUS=%%S"
for /f "usebackq delims=" %%S in (`node -e "try{const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write((j.reason||'').replace(/[\r\n]+/g,' '))}catch(e){process.stdout.write('')}" "%MANIFEST_JSON_FILE%"`) do set "M_REASON=%%S"

if /I "%M_STATUS%"=="noop" (
  call :log "F4.3: sin actualizacion aplicable. Motivo: %M_REASON%. (evento registrado, sin cambios)"
  del /q "%MANIFEST_JSON_FILE%" >nul 2>nul
  call :release_lock
  exit /b 0
)
if /I not "%M_STATUS%"=="ok" (
  call :log_err "F4.3: verificacion/consulta invalida o rechazada. Motivo: %M_REASON%. Abortando sin aplicar cambios."
  del /q "%MANIFEST_JSON_FILE%" >nul 2>nul
  call :release_lock
  exit /b 4
)
if not "%HELPER_RC%"=="0" (
  call :log_err "F4.3: helper retorno error. Abortando sin aplicar cambios."
  del /q "%MANIFEST_JSON_FILE%" >nul 2>nul
  call :release_lock
  exit /b 4
)

for /f "usebackq delims=" %%S in (`node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(j.version||'')" "%MANIFEST_JSON_FILE%"`) do set "NEW_VERSION=%%S"
for /f "usebackq delims=" %%S in (`node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(j.image_ref||'')" "%MANIFEST_JSON_FILE%"`) do set "IMAGE_REF=%%S"
for /f "usebackq delims=" %%S in (`node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(j.image_digest_sha256||'')" "%MANIFEST_JSON_FILE%"`) do set "IMAGE_DIGEST=%%S"
del /q "%MANIFEST_JSON_FILE%" >nul 2>nul

for /f "usebackq delims=" %%S in (`node -e "let d=process.argv[1]||'';d=d.replace(/^sha256:/,'');process.stdout.write('sha256:'+d)" "%IMAGE_DIGEST%"`) do set "IMAGE_DIGEST_NORM=%%S"

if not defined APP_IMAGE set "APP_IMAGE=%IMAGE_REF%"
for /f "usebackq delims=" %%S in (`node -e "let r=process.argv[1]||'';r=r.split('@')[0];const i=r.lastIndexOf('/');const last=i>=0?r.slice(i+1):r;if(last.includes(':'))r=r.slice(0,r.lastIndexOf(':'));process.stdout.write(r)" "%APP_IMAGE%"`) do set "APP_IMAGE_BASE=%%S"
if "!APP_IMAGE_BASE!"=="" for /f "usebackq delims=" %%S in (`node -e "let r=process.argv[1]||'';r=r.split('@')[0];const i=r.lastIndexOf('/');const last=i>=0?r.slice(i+1):r;if(last.includes(':'))r=r.slice(0,r.lastIndexOf(':'));process.stdout.write(r)" "%IMAGE_REF%"`) do set "APP_IMAGE_BASE=%%S"
set "PINNED_REF=!APP_IMAGE_BASE!@!IMAGE_DIGEST_NORM!"

call :log "F4.3: manifiesto firmado y valido. Nueva version=%NEW_VERSION% (digest verificado)."

if "%DRY_RUN%"=="1" (
  call :log "DRY-RUN: se omiten F4.4/F4.5/F4.6 (sin backup, sin pull, sin apply/migrate). Verificacion OK."
  call :release_lock
  exit /b 0
)

REM Estado previo y prefijo
if not defined APP_IMAGE_TAG set "PREV_TAG=latest"
if defined APP_IMAGE_TAG set "PREV_TAG=%APP_IMAGE_TAG%"
if not defined APP_IMAGE set "PREV_IMAGE=!APP_IMAGE_BASE!"
if defined APP_IMAGE set "PREV_IMAGE=%APP_IMAGE%"
set "PREV_ID="
for /f "usebackq delims=" %%S in (`%COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" images -q app 2^>nul`) do if not defined PREV_ID set "PREV_ID=%%S"

for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"`) do set "TS_PREFIX=%%S"
set "PREFIX=update-%TS_PREFIX%-%RANDOM%"
call :log "Estado previo registrado: tag=%PREV_TAG% id=%PREV_ID%"

REM F4.4 backup
call :do_backup "%PREFIX%"
if errorlevel 1 (
  call :log_err "F4.4: backup no exitoso. Abortando sin aplicar cambios."
  call :release_lock
  exit /b 5
)

call :log "F4.4: pull estricto por digest firmado"
docker pull "!PINNED_REF!" >>"%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log_err "F4.4: docker pull por digest fallo. Abortando (backup disponible %PREFIX%)."
  call :release_lock
  exit /b 6
)
docker tag "!PINNED_REF!" "!APP_IMAGE_BASE!:%NEW_VERSION%" >>"%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log_err "F4.4: no se pudo etiquetar imagen localmente. Abortando."
  call :release_lock
  exit /b 6
)
call :log "F4.4: imagen verificada descargada y etiquetada localmente para version %NEW_VERSION%"

REM F4.5/F4.6
set "MIGRATION_ATTEMPTED=0"
set "RESTORE_REQUIRED=0"
set "FAIL_PHASE="

call :log "F4.5: actualizando APP_IMAGE_TAG en .env a version %NEW_VERSION%"
powershell -NoProfile -Command "$p=$env:ENV_FILE; $t=$env:NEW_VERSION; $c=Get-Content -Raw -LiteralPath $p; if($c -match '(?m)^APP_IMAGE_TAG=.*$'){ $c=[regex]::Replace($c,'(?m)^APP_IMAGE_TAG=.*$',\"APP_IMAGE_TAG=$t\") } else { $c=$c+\"`r`nAPP_IMAGE_TAG=$t`r`n\" }; [IO.File]::WriteAllText($p,$c,[Text.UTF8Encoding]::new($false))"
if errorlevel 1 (
  set "FAIL_PHASE=env-update"
  goto :rollback
)

call :log "F4.5: aplicando nueva imagen (compose up -d app)"
%COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" up -d app >>"%LOG_FILE%" 2>&1
if errorlevel 1 (
  set "FAIL_PHASE=compose-up"
  goto :rollback
)

call :log "F4.5: ejecutando migraciones (npm run migration:run)"
set "MIGRATION_ATTEMPTED=1"
%COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" exec -T app npm run migration:run >>"%LOG_FILE%" 2>&1
if errorlevel 1 (
  set "FAIL_PHASE=migration-run"
  set "RESTORE_REQUIRED=1"
  goto :rollback
)
call :log "F4.5: migraciones ejecutadas correctamente"

call :log "F4.6: smoke test /health"
call :check_health
if errorlevel 1 (
  set "FAIL_PHASE=health-smoke"
  set "RESTORE_REQUIRED=1"
  goto :rollback
)

call :log "Actualizacion completada OK: version=%NEW_VERSION% (digest verificado). Backup: %PREFIX%"
call :log "===== Fin nightly-update OK ====="
call :release_lock
exit /b 0

:rollback
call :log_err "F4.6: fallo detectado (%FAIL_PHASE%). Iniciando rollback automatico."
%COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" stop app >>"%LOG_FILE%" 2>&1
%COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" rm -f app >>"%LOG_FILE%" 2>&1

if "%MIGRATION_ATTEMPTED%"=="1" (
  call :log_err "F4.6: migration_attempted=1. Intentando restore de DB desde backup verificado (%PREFIX%)."
  call :restore_db "%PREFIX%"
  if errorlevel 1 (
    set "RESTORE_REQUIRED=1"
    call :log_err "F4.6: RESTORE REQUERIDO - fallo al restaurar DB automaticamente (backup: %PREFIX%)."
  ) else (
    call :log "F4.6: restore de DB completado."
  )
) else (
  call :log "F4.6: no se intento migracion; rollback app-only (sin restore de DB)."
)

call :restore_env "%PREFIX%"
if errorlevel 1 set "RESTORE_REQUIRED=1"

if defined PREV_ID docker tag "%PREV_ID%" "!APP_IMAGE_BASE!:%PREV_TAG%" >>"%LOG_FILE%" 2>&1
call :log "F4.6: levantando version/configuracion previa"
%COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" up -d app >>"%LOG_FILE%" 2>&1
call :check_health
if errorlevel 1 (
  call :log_err "F4.6: health basico no confirmado tras rollback."
  if "%MIGRATION_ATTEMPTED%"=="1" set "RESTORE_REQUIRED=1"
) else (
  call :log "F4.6: health basico OK tras rollback a version previa."
)

if "%RESTORE_REQUIRED%"=="1" (
  call :log_err "F4.6: RESTORE REQUERIDO - verificar integridad de esquema/datos y consistencia con imagen previa (backup verificado: %PREFIX%)."
) else if "%MIGRATION_ATTEMPTED%"=="1" (
  call :log_err "F4.6: RESTORE REQUERIDO - migracion pudo ejecutarse/parcialmente; verificar integridad (backup verificado: %PREFIX%)."
) else (
  call :log "F4.6: rollback app-only completado (sin indicios de cambio de esquema)."
)
call :release_lock
if "%FAIL_PHASE%"=="compose-up" exit /b 7
if "%FAIL_PHASE%"=="migration-run" exit /b 8
if "%FAIL_PHASE%"=="health-smoke" exit /b 9
exit /b 1

REM ===== Subrutinas =====

:log
set "_MSG=%~1"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'"`) do set "_TS=%%T"
>>"%LOG_FILE%" echo [%_TS%] %_MSG%
echo [update-agent] %_MSG%
exit /b 0

:log_err
set "_MSG=%~1"
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'"`) do set "_TS=%%T"
>>"%LOG_FILE%" echo [%_TS%] ERROR: %_MSG%
>&2 echo [update-agent][ERROR] %_MSG%
exit /b 0

:load_env
REM Carga .env simple KEY=VALUE al entorno del proceso (sin imprimir secretos)
for /f "usebackq delims=" %%L in (`powershell -NoProfile -Command "$p=$args[0]; Get-Content -LiteralPath $p | ForEach-Object { $l=$_; if($l -match '^\s*#' -or $l -match '^\s*$'){return}; if($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$'){ $k=$matches[1]; $v=$matches[2]; $v=$v -replace \"`r\",''; Write-Output ('__KV__'+$k+'__EQ__'+$v) } }" "%~1"`) do (
  set "_LINE=%%L"
  set "_LINE=!_LINE:__KV__=!"
  for /f "tokens=1,* delims==" %%K in ("!_LINE:__EQ__==!") do set "%%K=%%LVAL"
)
REM fallback robusto: usar PowerShell para setear via archivo temporal de set commands
set "_ENVSET=%TEMP%\ua_env_%RANDOM%.cmd"
powershell -NoProfile -Command "$p=$args[0]; $out=@(); Get-Content -LiteralPath $p | ForEach-Object { $l=$_; if($l -match '^\s*#' -or $l -match '^\s*$'){return}; if($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$'){ $k=$matches[1]; $v=$matches[2].TrimEnd(); $v=$v -replace '\^','^^' -replace '&','^&' -replace '\|','^|' -replace '<','^<' -replace '>','^>' -replace '!','^^!'; $out += ('set \"'+$k+'='+$matches[2].TrimEnd()+'\"') } }; [IO.File]::WriteAllLines($args[1]+'.cmdtmp',$out,[Text.UTF8Encoding]::new($false))" "%~1" >nul 2>nul
if exist "%~1.cmdtmp" (
  REM apply safely line by line
  for /f "usebackq delims=" %%E in ("%~1.cmdtmp") do %%E
  del /q "%~1.cmdtmp" >nul 2>nul
)
exit /b 0

:acquire_lock
if exist "%LOCK_FILE%" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$f=$args[0]; $stale=[int]$args[1]; if(!(Test-Path $f)){exit 0}; $age=((Get-Date)-(Get-Item $f).LastWriteTime).TotalSeconds; $txt=Get-Content -Raw $f; $pid=0; if($txt -match 'pid=(\d+)'){$pid=[int]$matches[1]}; $alive=$false; if($pid -gt 0){ try{ Get-Process -Id $pid -ErrorAction Stop | Out-Null; $alive=$true }catch{} }; if($alive -and $age -lt $stale){Write-Output 'ACTIVE'} elseif($age -lt $stale -and $pid -gt 0){Write-Output 'RECENT_ORPHAN'} else {Write-Output 'STALE'}" "%LOCK_FILE%" "%UPDATE_LOCK_STALE_SEC%"`) do set "LOCK_STATE=%%A"
  if /I "!LOCK_STATE!"=="ACTIVE" (call :log_err "Otra ejecucion en curso (lock activo). Abortando." & exit /b 3)
  if /I "!LOCK_STATE!"=="RECENT_ORPHAN" (call :log_err "Lock huerfano reciente. Abortando por seguridad." & exit /b 3)
  call :log "Lock stale detectado. Recuperando."
  del /q "%LOCK_FILE%" >nul 2>nul
)
powershell -NoProfile -Command "$f=$args[0]; $pid=$PID; $ts=Get-Date -Format o; $h=$env:COMPUTERNAME; Set-Content -LiteralPath $f -Value ('pid='+$pid+' ts='+$ts+' host='+$h) -NoNewline" "%LOCK_FILE%" >nul 2>nul
call :log "Lock adquirido: %LOCK_FILE%"
exit /b 0

:release_lock
if exist "%LOCK_FILE%" del /q "%LOCK_FILE%" >nul 2>nul
exit /b 0

:wait_window_jitter
if "%NO_WAIT%"=="1" (
  call :log "Modo --now/--no-wait: omitiendo espera de ventana y jitter."
  exit /b 0
)
for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "$wt=$env:UPDATE_WINDOW_TIME; if($wt -notmatch '^\d{1,2}:\d{2}$'){$wt='03:00'}; $parts=$wt.Split(':'); $h=[int]$parts[0]; $m=[int]$parts[1]; $now=Get-Date; $target=Get-Date -Hour $h -Minute $m -Second 0; if($now -gt $target){$target=$target.AddDays(1)}; [int][Math]::Max(0,($target-$now).TotalSeconds)"`) do set "WAIT_SEC=%%S"
if %WAIT_SEC% GTR 0 (
  call :log "Esperando ventana nocturna %UPDATE_WINDOW_TIME% local (%WAIT_SEC%s)..."
  powershell -NoProfile -Command "Start-Sleep -Seconds %WAIT_SEC%"
)
for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "$m=[int]$env:UPDATE_JITTER_MAX_SEC; if($m -lt 0){$m=0}; if($m -eq 0){0}else{Get-Random -Minimum 0 -Maximum ($m+1)}"`) do set "JITTER_SEC=%%S"
if %JITTER_SEC% GTR 0 (
  call :log "Aplicando jitter aleatorio: %JITTER_SEC%s (max %UPDATE_JITTER_MAX_SEC%s)."
  powershell -NoProfile -Command "Start-Sleep -Seconds %JITTER_SEC%"
)
exit /b 0

:do_backup
set "_PREFIX=%~1"
call :log "F4.4: iniciando backup verificado (prefijo %_PREFIX%)"
if not exist "%BACKUPS_DIR%" mkdir "%BACKUPS_DIR%"

if defined POSTGRES_USER (set "_DB_USER=%POSTGRES_USER%") else if defined DB_USERNAME (set "_DB_USER=%DB_USERNAME%") else set "_DB_USER=admin"
if defined POSTGRES_DB (set "_DB_NAME=%POSTGRES_DB%") else if defined DB_NAME (set "_DB_NAME=%DB_NAME%") else set "_DB_NAME=erp_database"
set "_DUMP=%BACKUPS_DIR%\%_PREFIX%-db.sql.gz"

call :log "F4.4: ejecutando pg_dump (db=%_DB_NAME%)"
%COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" exec -T db pg_dump -U "%_DB_USER%" -d "%_DB_NAME%" --no-owner --no-acl > "%BACKUPS_DIR%\%_PREFIX%-db.sql" 2>>"%LOG_FILE%"
if errorlevel 1 (
  call :log_err "F4.4: pg_dump fallo"
  if exist "%BACKUPS_DIR%\%_PREFIX%-db.sql" del /q "%BACKUPS_DIR%\%_PREFIX%-db.sql" >nul 2>nul
  exit /b 1
)
powershell -NoProfile -Command "$in=$args[0]; $out=$args[1]; $i=[IO.File]::OpenRead($in); $o=[IO.File]::Create($out); $g=New-Object IO.Compression.GzipStream($o,[IO.Compression.CompressionMode]::Compress); $i.CopyTo($g); $g.Dispose(); $o.Dispose(); $i.Dispose(); Remove-Item -LiteralPath $in -Force" "%BACKUPS_DIR%\%_PREFIX%-db.sql" "%_DUMP%"
if not exist "%_DUMP%" (call :log_err "F4.4: no se creo dump comprimido" & exit /b 1)
for %%A in ("%_DUMP%") do if %%~zA LEQ 0 (call :log_err "F4.4: dump vacio" & exit /b 1)

if not exist "%LICENSE_DIR%" mkdir "%LICENSE_DIR%" >nul 2>nul
tar -czf "%BACKUPS_DIR%\%_PREFIX%-license.tar.gz" -C "%DEPLOY_DIR%" "license" >>"%LOG_FILE%" 2>&1
if errorlevel 1 (call :log_err "F4.4: respaldo de license invalido" & exit /b 1)

copy /y "%ENV_FILE%" "%BACKUPS_DIR%\%_PREFIX%-.env" >nul
if not exist "%BACKUPS_DIR%\%_PREFIX%-.env" (call :log_err "F4.4: respaldo de .env invalido" & exit /b 1)
if exist "%COMPOSE_FILE%" copy /y "%COMPOSE_FILE%" "%BACKUPS_DIR%\%_PREFIX%-compose.yml" >nul 2>nul

call :log "F4.4: backup completado y verificado (db, license, .env, compose)"
exit /b 0

:restore_env
set "_PREFIX=%~1"
if exist "%BACKUPS_DIR%\%_PREFIX%-.env" (
  copy /y "%BACKUPS_DIR%\%_PREFIX%-.env" "%ENV_FILE%" >nul
  call :log "Rollback: .env restaurado desde backup %_PREFIX%"
  exit /b 0
)
call :log_err "Rollback: no se encontro backup de .env (%_PREFIX%)"
exit /b 1

:restore_db
set "_PREFIX=%~1"
if defined POSTGRES_USER (set "_DB_USER=%POSTGRES_USER%") else if defined DB_USERNAME (set "_DB_USER=%DB_USERNAME%") else set "_DB_USER=admin"
if defined POSTGRES_DB (set "_DB_NAME=%POSTGRES_DB%") else if defined DB_NAME (set "_DB_NAME=%DB_NAME%") else set "_DB_NAME=erp_database"
set "_DUMP=%BACKUPS_DIR%\%_PREFIX%-db.sql.gz"
if not exist "%_DUMP%" (call :log_err "Restore DB: dump no encontrado (%_DUMP%)" & exit /b 1)
call :log "Rollback/restore: restaurando base de datos desde %_PREFIX%-db.sql.gz"
%COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" exec -T db psql -v ON_ERROR_STOP=1 -U "%_DB_USER%" -d "%_DB_NAME%" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >>"%LOG_FILE%" 2>&1
if errorlevel 1 (call :log_err "Restore DB: fallo al limpiar esquema public" & exit /b 1)
powershell -NoProfile -Command "$p=$args[0]; $fs=[IO.File]::OpenRead($p); $gz=New-Object IO.Compression.GzipStream($fs,[IO.Compression.CompressionMode]::Decompress); $sr=New-Object IO.StreamReader($gz); while($null -ne ($line=$sr.ReadLine())){[Console]::Out.WriteLine($line)}; $sr.Dispose(); $gz.Dispose(); $fs.Dispose()" "%_DUMP%" | %COMPOSE_CMD% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" exec -T db psql -v ON_ERROR_STOP=1 -U "%_DB_USER%" -d "%_DB_NAME%" >>"%LOG_FILE%" 2>&1
if errorlevel 1 (call :log_err "Restore DB: fallo al importar dump" & exit /b 1)
call :log "Restore DB: completado desde backup %_PREFIX%"
exit /b 0

:check_health
if not defined APP_PORT set "_PORT=3000"
if defined APP_PORT set "_PORT=%APP_PORT%"
set "_URL=http://localhost:%_PORT%/health"
set "_ATT=1"
:health_loop
curl -fsS --max-time 5 "%_URL%" >nul 2>nul
if not errorlevel 1 (
  call :log "Smoke /health OK (intento %_ATT%/%UPDATE_HEALTH_RETRIES%)"
  exit /b 0
)
call :log "Smoke /health pendiente (intento %_ATT%/%UPDATE_HEALTH_RETRIES%)..."
if %_ATT% GEQ %UPDATE_HEALTH_RETRIES% (
  call :log_err "Smoke /health fallo tras %UPDATE_HEALTH_RETRIES% intentos (%_URL%)"
  exit /b 1
)
powershell -NoProfile -Command "Start-Sleep -Seconds %UPDATE_HEALTH_DELAY_SEC%"
set /a _ATT+=1
goto :health_loop
