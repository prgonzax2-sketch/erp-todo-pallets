# bootstrap.ps1 - Helper interno del instalador Windows (Sistema Aserradero ERP)
# Ejecutado por setup.exe (Inno Setup). Idempotente y no interactivo.
# Flujo: verifica/instala Docker Desktop -> prepara .env/carpetas -> levanta stack -> configura accesos directos.
param(
    [string]$DesktopShortcut = "",
    [string]$GroupShortcut = ""
)

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
    # Base64url-ish sin caracteres problemáticos en .env
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

function Get-DockerExePath {
    $candidates = @(
        "C:\Program Files\Docker\Docker\Docker Desktop.exe",
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    )
    foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
    $cmd = Get-Command "Docker Desktop.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Refresh-DockerPath {
    # Tras instalar Docker, el PATH del proceso actual puede no incluir docker.exe
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ($machine + ';' + $user)
    $dockerBin = "C:\Program Files\Docker\Docker\resources\bin"
    if ((Test-Path $dockerBin) -and ($env:Path -notlike "*$dockerBin*")) {
        $env:Path = $env:Path + ';' + $dockerBin
    }
}

function Test-DockerEngineReady {
    try {
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & docker info *> $null
        $code = $LASTEXITCODE
        $ErrorActionPreference = $prev
        return ($code -eq 0)
    } catch { return $false }
}

function Wait-DockerEngineReady {
    param([int]$TimeoutSeconds = 600, [int]$IntervalSeconds = 5)
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        Refresh-DockerPath
        if (Test-DockerEngineReady) { return $true }
        Start-Sleep -Seconds $IntervalSeconds
        $elapsed += $IntervalSeconds
        if (($elapsed % 30) -eq 0) { Write-Log "Esperando a que Docker esté listo... (${elapsed}s/${TimeoutSeconds}s)" }
    }
    return $false
}

function Show-ErrorDialog {
    param([string]$Text)
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
        [System.Windows.MessageBox]::Show(
            $Text,
            "Sistema Aserradero ERP - Instalación",
            'OK',
            'Error'
        ) | Out-Null
    } catch { }
}

try {
    $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    Set-Location -Path $AppDir
    $script:LogPath = Join-Path $AppDir 'bootstrap.log'
    Write-Log "Inicio bootstrap. Dir: $AppDir"

    # 1) Verificar Docker / instalar Docker Desktop si falta
    Refresh-DockerPath
    $dockerExe = Get-DockerExePath
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue

    if (-not $dockerCmd -and -not $dockerExe) {
        Write-Log "Docker no encontrado. Descargando Docker Desktop..."
        $installerPath = Join-Path $AppDir 'DockerSetup.exe'
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" -OutFile $installerPath -UseBasicParsing
        } catch {
            throw "No se pudo descargar Docker Desktop. Verifique la conexión a internet e intente nuevamente. Detalle: $($_.Exception.Message)"
        }

        Write-Log "Instalando Docker Desktop (puede tardar varios minutos)..."
        $installProc = Start-Process -FilePath $installerPath -ArgumentList "install --quiet --accept-license" -Wait -NoNewWindow -PassThru
        try { Remove-Item $installerPath -Force -ErrorAction SilentlyContinue } catch { }
        if ($installProc.ExitCode -ne 0) {
            Write-Log "El instalador de Docker finalizó con código $($installProc.ExitCode). Puede requerir reinicio del equipo." 'WARN'
        }
        Refresh-DockerPath
        $dockerExe = Get-DockerExePath
    }

    # Asegurar que Docker Desktop esté iniciado y el motor listo (validación previa antes de docker compose)
    Refresh-DockerPath
    if (-not (Test-DockerEngineReady)) {
        $dockerExe = Get-DockerExePath
        if ($dockerExe) {
            Write-Log "Iniciando Docker Desktop..."
            try { Start-Process -FilePath $dockerExe | Out-Null } catch { Write-Log "No se pudo iniciar Docker Desktop automáticamente: $($_.Exception.Message)" 'WARN' }
        }
        Write-Log "Esperando a que el motor de Docker esté listo (puede tardar varios minutos la primera vez)..."
        if (-not (Wait-DockerEngineReady -TimeoutSeconds 900 -IntervalSeconds 5)) {
            $msgDocker = "Docker Desktop no está activo o no responde. Inicie Docker Desktop, espere a que indique que está en ejecución y vuelva a ejecutar el instalador."
            Write-Log $msgDocker 'ERROR'
            throw $msgDocker
        }
    }
    Refresh-DockerPath
    if (-not (Test-DockerEngineReady)) {
        $msgDocker = "Docker Desktop no está activo o no responde. Inicie Docker Desktop y vuelva a ejecutar el instalador."
        Write-Log $msgDocker 'ERROR'
        throw $msgDocker
    }
    Write-Log "Docker activo y listo."

    # 2) Crear carpetas estructurales
    foreach ($d in @('dbdata', 'backups', 'license')) {
        $p = Join-Path $AppDir $d
        if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
    }
    try {
        $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls (Join-Path $AppDir 'license') /inheritance:r /grant:r "${user}:(OI)(CI)F" *> $null
        & icacls (Join-Path $AppDir 'backups') /inheritance:r /grant:r "${user}:(OI)(CI)M" *> $null
        & icacls (Join-Path $AppDir 'dbdata')  /inheritance:r /grant:r "${user}:(OI)(CI)M" *> $null
    } catch { Write-Log "Ajuste de permisos (icacls) omitido: $($_.Exception.Message)" 'WARN' }
    Write-Log "Carpetas verificadas: dbdata, backups, license."

    # 3) .env autogenerado si falta (credenciales seguras, idempotente)
    $envPath = Join-Path $AppDir '.env'
    $examplePath = Join-Path $AppDir '.env.example'
    if (-not (Test-Path $examplePath)) {
        throw "No se encontró .env.example en $AppDir."
    }
    # URL oficial centralizada por defecto (remota). Se puede sobreescribir con variable de entorno externa LICENSE_SERVER_URL.
    $defaultLicenseServerUrl = 'https://auth.sistemaaserradero.com.ar'
    if (-not [string]::IsNullOrWhiteSpace($env:LICENSE_SERVER_URL)) {
        $defaultLicenseServerUrl = $env:LICENSE_SERVER_URL.Trim()
    }
    if (-not (Test-Path $envPath)) {
        $content = Get-Content -Path $examplePath -Raw -Encoding UTF8
        $dbPass = New-RandomSecret -Bytes 24
        $jwt = New-RandomSecret -Bytes 48
        $content = Set-EnvValue -Content $content -Key 'DB_PASSWORD' -Value $dbPass
        $content = Set-EnvValue -Content $content -Key 'POSTGRES_PASSWORD' -Value $dbPass
        $content = Set-EnvValue -Content $content -Key 'JWT_SECRET' -Value $jwt
        $content = Set-EnvValue -Content $content -Key 'LICENSE_STATE_PATH' -Value '/app/license'
        $content = Set-EnvValue -Content $content -Key 'BACKUP_DIRECTORY' -Value '/backups'
        $content = Set-EnvValue -Content $content -Key 'TYPEORM_SYNCHRONIZE' -Value 'false'
        $content = Set-EnvValue -Content $content -Key 'LICENSE_ENFORCEMENT' -Value 'grace'
        $content = Set-EnvValue -Content $content -Key 'UPDATES_AUTO_ENABLED' -Value 'false'
        # Inyecta LICENSE_SERVER_URL oficial/remota por defecto (salvo variable externa provista)
        $content = Set-EnvValue -Content $content -Key 'LICENSE_SERVER_URL' -Value $defaultLicenseServerUrl
        Set-Content -Path $envPath -Value $content -Encoding UTF8
        try {
            $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
            & icacls $envPath /inheritance:r /grant:r "${user}:(R,W)" *> $null
        } catch { }
        Write-Log ".env generado desde .env.example con credenciales seguras (DB/JWT) y LICENSE_SERVER_URL=$defaultLicenseServerUrl."
    } else {
        Write-Log ".env existente conservado (idempotente)."
    }

    # Advertencia de configuración de licencia para operación remota (no bloqueante)
    try {
        $licenseUrl = ""
        $envContentForLicense = Get-Content -Path $envPath -Raw -Encoding UTF8
        $mLic = [regex]::Match($envContentForLicense, '(?m)^\s*LICENSE_SERVER_URL\s*=\s*(.*)$')
        if ($mLic.Success) {
            $licenseUrl = $mLic.Groups[1].Value.Trim().Trim('"').Trim("'")
        }
        if ([string]::IsNullOrWhiteSpace($licenseUrl)) {
            Write-Log "ADVERTENCIA: LICENSE_SERVER_URL no está configurado. Para validación de licencia remota configure la URL HTTPS del servidor de licencias (Auth central) en .env." 'WARN'
        } elseif ($licenseUrl -match 'localhost|127\.0\.0\.1|host\.docker\.internal') {
            Write-Log "ADVERTENCIA: LICENSE_SERVER_URL apunta a una dirección local ($licenseUrl). Para instalaciones remotas/otras PC debe usar la URL accesible del servidor de licencias central (HTTPS). Valor actual válido solo para pruebas locales." 'WARN'
        }
    } catch {
        Write-Log "No se pudo verificar LICENSE_SERVER_URL: $($_.Exception.Message)" 'WARN'
    }

    # 4) Levantar stack (imagen pública en GHCR, sin credenciales embebidas)
    $composeFile = Join-Path $AppDir 'docker-compose.prod.yml'
    if (-not (Test-Path $composeFile)) {
        throw "No se encontró docker-compose.prod.yml en $AppDir."
    }

    # Verificación final: Docker debe responder antes de ejecutar docker compose
    Refresh-DockerPath
    if (-not (Test-DockerEngineReady)) {
        $msgDocker = "Docker Desktop no está activo o no responde. Inicie Docker Desktop y vuelva a ejecutar el instalador."
        Write-Log $msgDocker 'ERROR'
        throw $msgDocker
    }

    $composeCmdDisplay = 'docker compose -f "docker-compose.prod.yml" --env-file ".env" up -d --pull always'
    $composeArgs = @('compose', '-f', 'docker-compose.prod.yml', '--env-file', '.env', 'up', '-d', '--pull', 'always')
    $maxAttempts = 3
    $composeOk = $false
    $lastExitCode = 1
    $lastOutput = ""

    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        Write-Log "Descargando/iniciando Sistema Aserradero ERP (intento $attempt de $maxAttempts): $composeCmdDisplay"
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $outputLines = & docker @composeArgs 2>&1
        $lastExitCode = $LASTEXITCODE
        $ErrorActionPreference = $prevEap
        $lastOutput = ($outputLines | ForEach-Object { $_.ToString() }) -join "`r`n"

        # Volcar salida completa al log (UTF-8)
        if ($lastOutput) {
            try {
                Add-Content -Path $script:LogPath -Value "--- Salida docker compose (intento $attempt, código $lastExitCode) ---" -Encoding UTF8
                Add-Content -Path $script:LogPath -Value $lastOutput -Encoding UTF8
                Add-Content -Path $script:LogPath -Value "--- Fin salida intento $attempt ---" -Encoding UTF8
            } catch { }
        } else {
            try { Add-Content -Path $script:LogPath -Value "--- Salida docker compose (intento $attempt, código $lastExitCode): (sin salida) ---" -Encoding UTF8 } catch { }
        }

        if ($lastExitCode -eq 0) {
            $composeOk = $true
            break
        }

        Write-Log "docker compose falló en intento $attempt con código $lastExitCode." 'WARN'
        if ($attempt -lt $maxAttempts) {
            Write-Log "Reintentando en 5 segundos..." 'WARN'
            Start-Sleep -Seconds 5
            Refresh-DockerPath
            if (-not (Test-DockerEngineReady)) {
                Write-Log "Docker dejó de responder antes del reintento." 'WARN'
            }
        }
    }

    if (-not $composeOk) {
        Write-Log "Fallo persistente: comando ejecutado: $composeCmdDisplay" 'ERROR'
        Write-Log "Fallo persistente: código de salida: $lastExitCode" 'ERROR'
        if ($lastOutput) { Write-Log "Fallo persistente: traza/salida de Docker registrada arriba en bootstrap.log" 'ERROR' }
        throw "No se pudo iniciar el sistema tras $maxAttempts intentos (docker compose código $lastExitCode). Revise bootstrap.log para ver el comando ejecutado y la traza completa de Docker."
    }
    Write-Log "Servicios iniciados correctamente."

    # 5) Actualizar accesos directos con el puerto configurado
    $appPort = "3000"
    $envFile = Join-Path $AppDir ".env"
    if (Test-Path -LiteralPath $envFile) {
        $envMatch = Select-String -Path $envFile -Pattern "^APP_PORT\s*=\s*['`"]?(.*?)['`"]?\s*(?:#.*)?$" -ErrorAction SilentlyContinue
        if ($envMatch) {
            $parsedPort = $envMatch.Matches.Groups[1].Value.Trim()
            if ($parsedPort -match "^\d+$") {
                $appPort = $parsedPort
                Write-Log "APP_PORT ($appPort) detectado para accesos directos."
            }
        }
    }

    $shortcuts = @()
    if ($DesktopShortcut -ne "") { $shortcuts += $DesktopShortcut }
    if ($GroupShortcut -ne "") { $shortcuts += $GroupShortcut }
    foreach ($sc in $shortcuts) {
        if (Test-Path -LiteralPath $sc) {
            try {
                $content = Get-Content -Path $sc -Raw
                if ($content -match "PORT_PLACEHOLDER") {
                    $newContent = $content -replace "PORT_PLACEHOLDER", $appPort
                    Set-Content -Path $sc -Value $newContent -Encoding Ascii -Force
                    Write-Log "Acceso directo actualizado: $sc"
                }
            } catch {
                Write-Log "No se pudo actualizar acceso directo: $sc. $($_.Exception.Message)" 'WARN'
            }
        }
    }

    Write-Log "Instalación completada. Acceso: http://localhost:$appPort"
    Write-Host ""
    Write-Host "Sistema Aserradero ERP instalado. Abra: http://localhost:$appPort" -ForegroundColor Green
    exit 0
}
catch {
    $msg = $_.Exception.Message
    Write-Log $msg 'ERROR'
    Show-ErrorDialog "No se pudo completar la instalación automática.`n`n$msg`n`nRevise el archivo bootstrap.log en la carpeta de instalación para más detalles."
    exit 1
}
