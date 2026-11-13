<#
.SYNOPSIS
  Carga offline de imágenes Docker (ERP y Auth) desde archivos .tar.

.DESCRIPTION
  Diseñado para instaladores offline en Windows. Docker Desktop puede tardar en
  inicializar el demonio en segundo plano; este script espera a que esté disponible
  (docker info) antes de ejecutar docker load para evitar fallos silenciosos.

  - Bucle de espera: intenta cada 5 segundos, timeout máximo 5 minutos.
  - Carga todos los .tar encontrados en el directorio de imágenes (ERP y Auth).
  - Redirige toda la salida (stdout/stderr) a docker-load.log para depuración en planta.

.PARAMETER ImagesDir
  Directorio que contiene los archivos .tar. Por defecto: <script>\images

.PARAMETER LogPath
  Ruta del archivo de log. Por defecto: <script>\docker-load.log

.EXAMPLE
  .\load-offline-images.ps1
  .\load-offline-images.ps1 -ImagesDir "C:\instalador\images"
#>
[CmdletBinding()]
param(
    [string]$ImagesDir = (Join-Path $PSScriptRoot 'images'),
    [string]$LogPath   = (Join-Path $PSScriptRoot 'docker-load.log')
)

$ErrorActionPreference = 'Continue'

# Redirigir toda la salida (stdout y stderr) al log
Start-Transcript -Path $LogPath -Force -ErrorAction SilentlyContinue | Out-Null

try {
    Write-Output "=== load-offline-images.ps1 ==="
    Write-Output ("Fecha: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    Write-Output ("ImagesDir: " + $ImagesDir)
    Write-Output ("LogPath: " + $LogPath)

    # --- Verificar Docker CLI ---
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-Error "Docker no está instalado o no está en PATH. Instale Docker Desktop e intente nuevamente."
        exit 1
    }

    # --- Espera de disponibilidad del demonio Docker (5 min, cada 5 s) ---
    $maxSeconds = 300
    $intervalSeconds = 5
    $elapsed = 0
    $ready = $false

    Write-Output "Esperando a que el demonio de Docker esté disponible (timeout ${maxSeconds}s, intervalo ${intervalSeconds}s)..."
    while ($elapsed -lt $maxSeconds) {
        # Validar estado del demonio (suprimir salida nativa)
        & docker info *> $null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            Write-Output ("Docker listo tras ${elapsed}s.")
            break
        }
        Write-Output ("Docker no disponible aún (${elapsed}s/${maxSeconds}s). Reintentando en ${intervalSeconds}s...")
        Start-Sleep -Seconds $intervalSeconds
        $elapsed += $intervalSeconds
    }

    if (-not $ready) {
        Write-Error "Timeout: el demonio de Docker no respondió tras ${maxSeconds}s. Verifique que Docker Desktop esté iniciado."
        exit 2
    }

    # --- Cargar archivos .tar (ERP y Auth) ---
    if (-not (Test-Path -LiteralPath $ImagesDir)) {
        Write-Error "No se encontró el directorio de imágenes: $ImagesDir"
        exit 3
    }

    $tarFiles = @(Get-ChildItem -LiteralPath $ImagesDir -Filter '*.tar' -File -ErrorAction SilentlyContinue | Sort-Object Name)
    if ($tarFiles.Count -eq 0) {
        Write-Error "No se encontraron archivos .tar en: $ImagesDir"
        exit 4
    }

    Write-Output ("Archivos .tar encontrados: " + $tarFiles.Count)
    $failed = 0
    foreach ($tar in $tarFiles) {
        Write-Output ""
        Write-Output ("Cargando imagen: " + $tar.FullName)
        & docker load -i $tar.FullName
        if ($LASTEXITCODE -ne 0) {
            Write-Error ("Fallo docker load para: " + $tar.Name)
            $failed++
        } else {
            Write-Output ("OK: " + $tar.Name)
        }
    }

    if ($failed -gt 0) {
        Write-Error ("Carga finalizada con errores. Fallos: $failed de " + $tarFiles.Count)
        exit 5
    }

    Write-Output ""
    Write-Output "Carga offline completada correctamente."

    # --- Inicio interactivo opcional del sistema ---
    $respuesta = Read-Host "¿Desea iniciar el sistema ahora (docker compose up -d)? [S/N]"
    if ($respuesta -match '^(s|si|sí|y|yes)$') {
        $composeRoot = Join-Path $PSScriptRoot '..'
        $composeFile = Join-Path $composeRoot 'docker-compose.yml'
        if (Test-Path -LiteralPath $composeFile) {
            Write-Output "Archivo docker-compose.yml encontrado en: $composeRoot"
            Write-Output "Iniciando el sistema con: docker compose up -d"
            Push-Location -LiteralPath $composeRoot
            try {
                & docker compose up -d
                if ($LASTEXITCODE -ne 0) {
                    Write-Error "Fallo al ejecutar 'docker compose up -d'. Revise docker-load.log y el entorno."
                    exit 6
                } else {
                    Write-Output "Sistema iniciado correctamente."
                    exit 0
                }
            } finally {
                Pop-Location
            }
        } else {
            Write-Output "No se encontró docker-compose.yml en el directorio raíz ($composeRoot)."
            Write-Output "El operador debe configurar el archivo .env y arrancar el sistema manualmente."
            exit 0
        }
    } else {
        Write-Output "Inicio omitido por el operador. Configure el archivo .env y arranque el sistema manualmente cuando corresponda."
        exit 0
    }
}
finally {
    try { Stop-Transcript | Out-Null } catch { }
}
