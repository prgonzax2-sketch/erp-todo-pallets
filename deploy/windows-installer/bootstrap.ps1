# bootstrap.ps1 - Helper interno del instalador Windows (F3.6, Sistema Aserradero ERP)
# Ejecutado por setup.exe (Inno Setup). Idempotente y no interactivo.
# - Verifica Docker activo
# - Crea carpetas estructurales: dbdata, backups, license
# - Copia .env.example -> .env si falta, autogenerando credenciales seguras
# - Ejecuta: docker compose -f docker-compose.prod.yml up -d

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Log {
  param([string]$Message, [string]$Level = 'INFO')
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "[$ts][$Level] $Message"
  try { Add-Content -Path $script:LogPath -Value $line -Encoding UTF8 } catch { }
  Write-Host $line
}

function New-RandomSecret {
  param([int]$Bytes = 32)
  $buf = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buf) } finally { $rng.Dispose() }
  # URL/base64-safe-ish, sin caracteres problemáticos en .env simples
  $s = [Convert]::ToBase64String($buf) -replace '[+/=]', 'A'
  if ($s.Length -gt ($Bytes * 2)) { $s = $s.Substring(0, ($Bytes * 2)) }
  return $s
}

function Set-EnvValue {
  param([string]$Content, [string]$Key, [string]$Value)
  $pattern = "(?m)^${Key}=.*$"
  if ($Content -match $pattern) {
    return [regex]::Replace($Content, $pattern, "${Key}=${Value}")
  }
  return ($Content.TrimEnd() + "`r`n${Key}=${Value}`r`n")
}

try {
  $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  Set-Location -Path $AppDir
  $script:LogPath = Join-Path $AppDir 'bootstrap.log'
  Write-Log "Inicio bootstrap (F3.6). Dir: $AppDir"

  # 1) Verificar Docker activo
  $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $dockerCmd) {
    throw "Docker no está instalado o no está en PATH. Instale Docker Desktop y vuelva a ejecutar el instalador."
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker no está activo. Inicie Docker Desktop y espere a que esté listo, luego reintente la instalación."
  }
  Write-Log "Docker activo."

  # Resolver Compose (v2 preferido)
  $composeArgsPrefix = @('compose')
  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    $dc = Get-Command docker-compose -ErrorAction SilentlyContinue
    if (-not $dc) { throw "Docker Compose no encontrado (ni 'docker compose' ni 'docker-compose')." }
    $script:ComposeExe = 'docker-compose'
    $composeArgsPrefix = @()
    Write-Log "Usando docker-compose (v1)."
  } else {
    $script:ComposeExe = 'docker'
    Write-Log "Usando docker compose (v2)."
  }

  # 2) Crear carpetas estructurales
  foreach ($d in @('dbdata', 'backups', 'license')) {
    $p = Join-Path $AppDir $d
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
  }
  # Hardening best-effort (NTFS)
  try {
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls (Join-Path $AppDir 'license') /inheritance:r /grant:r "${user}:(OI)(CI)F" *> $null
    & icacls (Join-Path $AppDir 'backups') /inheritance:r /grant:r "${user}:(OI)(CI)M" *> $null
    & icacls (Join-Path $AppDir 'dbdata') /inheritance:r /grant:r "${user}:(OI)(CI)M" *> $null
  } catch { Write-Log "icacls best-effort omitido: $($_.Exception.Message)" 'WARN' }
  Write-Log "Carpetas verificadas: dbdata, backups, license."

  # 3) .env autogenerado si falta (credenciales seguras)
  $envPath = Join-Path $AppDir '.env'
  $examplePath = Join-Path $AppDir '.env.example'
  if (-not (Test-Path $examplePath)) {
    throw "No se encontró .env.example en $AppDir."
  }
  if (-not (Test-Path $envPath)) {
    $content = Get-Content -Path $examplePath -Raw -Encoding UTF8
    $dbPass = New-RandomSecret -Bytes 24
    $jwt = (New-RandomSecret -Bytes 48)
    $content = Set-EnvValue -Content $content -Key 'DB_PASSWORD' -Value $dbPass
    $content = Set-EnvValue -Content $content -Key 'POSTGRES_PASSWORD' -Value $dbPass
    $content = Set-EnvValue -Content $content -Key 'JWT_SECRET' -Value $jwt
    # Asegurar valores de producción/piloto y rutas de compose prod
    $content = Set-EnvValue -Content $content -Key 'LICENSE_STATE_PATH' -Value '/app/license'
    $content = Set-EnvValue -Content $content -Key 'BACKUP_DIRECTORY' -Value '/backups'
    $content = Set-EnvValue -Content $content -Key 'TYPEORM_SYNCHRONIZE' -Value 'false'
    $content = Set-EnvValue -Content $content -Key 'LICENSE_ENFORCEMENT' -Value 'grace'
    $content = Set-EnvValue -Content $content -Key 'UPDATES_AUTO_ENABLED' -Value 'false'
    Set-Content -Path $envPath -Value $content -Encoding UTF8
    Write-Log ".env generado desde .env.example con credenciales seguras (DB/JWT)."
  } else {
    Write-Log ".env existente conservado (idempotente)."
  }

  # 4) Levantar stack
  $composeFile = Join-Path $AppDir 'docker-compose.prod.yml'
  if (-not (Test-Path $composeFile)) {
    throw "No se encontró docker-compose.prod.yml en $AppDir."
  }
  Write-Log "Ejecutando docker compose up -d..."
  $args = @()
  $args += $composeArgsPrefix
  $args += @('-f', $composeFile, '--env-file', $envPath, 'up', '-d')
  & $script:ComposeExe @args 2>&1 | ForEach-Object { Write-Log $_ 'DOCKER' }
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up -d falló (código $LASTEXITCODE). Revise bootstrap.log y Docker Desktop."
  }
  Write-Log "Stack iniciado correctamente. Acceso: http://localhost:3000"
  exit 0
}
catch {
  Write-Log $_.Exception.Message 'ERROR'
  try {
    # Aviso visible si Docker no está listo / error crítico (útil en ejecución oculta)
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
    [System.Windows.MessageBox]::Show(
      "No se pudo completar la instalación automática.`n`n$($_.Exception.Message)`n`nRevise: $AppDir\bootstrap.log",
      "Sistema Aserradero ERP - Instalación",
      'OK',
      'Error'
    ) | Out-Null
  } catch { }
  exit 1
}
