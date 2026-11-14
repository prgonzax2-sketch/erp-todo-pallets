# actualizar.ps1 - Actualiza Sistema Aserradero ERP a la versión de imagen configurada
# Ejecutar desde la carpeta de instalación. Requiere Docker Desktop en ejecución e internet.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "[$ts][$Level] $Message"
    try { Add-Content -Path $script:LogPath -Value $line -Encoding UTF8 } catch { }
    Write-Host $line
}

try {
    $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    Set-Location -Path $AppDir
    $script:LogPath = Join-Path $AppDir 'actualizar.log'
    Write-Host ""
    Write-Host "Sistema Aserradero ERP - Actualizaci?n" -ForegroundColor Green
    Write-Host "Registro: $script:LogPath" -ForegroundColor Gray
    Write-Host ""
    Write-Log "Inicio actualizaci?n. Dir: $AppDir"

    Write-Log "[1/3] Verificando Docker Desktop..."
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & docker info *> $null
    $dockerReady = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    if (-not $dockerReady) {
        throw "Docker no est? en ejecuci?n. Abra Docker Desktop y vuelva a intentar."
    }

    if (-not (Test-Path (Join-Path $AppDir 'docker-compose.prod.yml'))) { throw "No se encontr? docker-compose.prod.yml." }
    if (-not (Test-Path (Join-Path $AppDir '.env'))) { throw "No se encontr? .env en la carpeta de instalaci?n." }

    Write-Log "[2/3] Descargando actualizaci?n (docker compose pull). Puede tardar seg?n la conexi?n..."
    $pull = Start-Process -FilePath "docker" -ArgumentList @('compose','-f','docker-compose.prod.yml','--env-file','.env','pull') -Wait -NoNewWindow -PassThru
    if ($pull.ExitCode -ne 0) { throw "No se pudo descargar la actualizaci?n (c?digo $($pull.ExitCode)). Verifique la conexi?n a internet." }

    Write-Log "[3/3] Aplicando actualizaci?n (docker compose up -d)..."
    $up = Start-Process -FilePath "docker" -ArgumentList @('compose','-f','docker-compose.prod.yml','--env-file','.env','up','-d') -Wait -NoNewWindow -PassThru
    if ($up.ExitCode -ne 0) { throw "No se pudo aplicar la actualizaci?n (c?digo $($up.ExitCode))." }

    Write-Log "Actualizaci?n completada."
    Write-Host ""
    Write-Host "Actualizaci?n completada correctamente." -ForegroundColor Green
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
        [System.Windows.MessageBox]::Show("Actualizaci?n completada correctamente.", "Sistema Aserradero ERP - Actualizaci?n", 'OK', 'Information') | Out-Null
    } catch { }
    exit 0
}
catch {
    $msg = $_.Exception.Message
    Write-Log $msg 'ERROR'
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
        [System.Windows.MessageBox]::Show("No se pudo completar la actualización.`n`n$msg`n`nRevise actualizar.log en la carpeta de instalación.", "Sistema Aserradero ERP - Actualización", 'OK', 'Error') | Out-Null
    } catch { }
    exit 1
}
