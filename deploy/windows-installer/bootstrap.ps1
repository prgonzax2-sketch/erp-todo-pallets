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

    # 6) Túnel remoto gratuito (cloudflared Quick Tunnel) para sucursales/remoto
    # - Sin cuenta ni apertura de puertos. URL efímera https://*.trycloudflare.com apuntando a localhost:$appPort
    # - Persiste URL activa en license\tunnel_url.txt (visible para backend/UI)
    try {
        $toolsDir = Join-Path $AppDir 'tools'
        $cfDir = Join-Path $toolsDir 'cloudflared'
        $cfExe = Join-Path $cfDir 'cloudflared.exe'
        $licenseDir = Join-Path $AppDir 'license'
        $tunnelUrlFile = Join-Path $licenseDir 'tunnel_url.txt'
        $tunnelLog = Join-Path $AppDir 'cloudflared.log'
        $tunnelHelper = Join-Path $AppDir 'start-tunnel.ps1'
        if (-not (Test-Path $cfDir)) { New-Item -ItemType Directory -Path $cfDir -Force | Out-Null }

        # Helper: inicia/reinicia cloudflared Quick Tunnel y captura URL pública (usado por bootstrap y tarea programada)
        $helperContent = @'
param([string]$AppDirParam = "", [int]$PortParam = 0)
$ErrorActionPreference = "Continue"
try {
  if ([string]::IsNullOrWhiteSpace($AppDirParam)) { $AppDirParam = Split-Path -Parent $MyInvocation.MyCommand.Path }
  $appDir = $AppDirParam
  $cfExe = Join-Path $appDir "tools\cloudflared\cloudflared.exe"
  $licenseDir = Join-Path $appDir "license"
  $tunnelUrlFile = Join-Path $licenseDir "tunnel_url.txt"
  $tunnelLog = Join-Path $appDir "cloudflared.log"
  if (-not (Test-Path $licenseDir)) { New-Item -ItemType Directory -Path $licenseDir -Force | Out-Null }
  if ($PortParam -le 0) {
    $envFile = Join-Path $appDir ".env"
    if (Test-Path $envFile) {
      $m = Select-String -Path $envFile -Pattern "^APP_PORT\s*=\s*['`"]?(.*?)['`"]?\s*(?:#.*)?$" -ErrorAction SilentlyContinue
      if ($m) { $p = $m.Matches.Groups[1].Value.Trim(); if ($p -match "^\d+$") { $PortParam = [int]$p } }
    }
    if ($PortParam -le 0) { $PortParam = 3000 }
  }
  if (-not (Test-Path $cfExe)) { Add-Content -Path $tunnelLog -Value "[$(Get-Date -Format s)] cloudflared.exe no encontrado." -Encoding UTF8; exit 1 }
  # Detener instancias previas de cloudflared lanzadas para este túnel rápido
  try { Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue } catch { }
  Start-Sleep -Milliseconds 500
  try { Remove-Item $tunnelUrlFile -Force -ErrorAction SilentlyContinue } catch { }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $cfExe
  $psi.Arguments = "tunnel --url http://localhost:$PortParam --no-autoupdate"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  $null = $proc.Start()
  Add-Content -Path $tunnelLog -Value "[$(Get-Date -Format s)] Iniciando cloudflared quick tunnel -> http://localhost:$PortParam (PID $($proc.Id))" -Encoding UTF8
  $found = $false
  $deadline = (Get-Date).AddSeconds(60)
  while (-not $proc.HasExited -and (Get-Date) -lt $deadline -and -not $found) {
    foreach ($stream in @($proc.StandardOutput, $proc.StandardError)) {
      while (-not $found -and -not $stream.EndOfStream) {
        $line = $stream.ReadLine()
        if ($null -ne $line) {
          Add-Content -Path $tunnelLog -Value $line -Encoding UTF8
          if (-not $found -and $line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
            $url = $Matches[0]
            Set-Content -Path $tunnelUrlFile -Value $url -Encoding ASCII
            Add-Content -Path $tunnelLog -Value "[$(Get-Date -Format s)] URL publica detectada: $url" -Encoding UTF8
            $found = $true
          }
        }
      }
    }
    if (-not $found) { Start-Sleep -Milliseconds 300 }
  }
  if (-not $found) { Add-Content -Path $tunnelLog -Value "[$(Get-Date -Format s)] No se detecto URL publica en 60s (cloudflared sigue en ejecucion)." -Encoding UTF8 }
  # Mantener drenando salida para que el proceso no bloquee; si se invoca desde tarea, el proceso queda vivo
  while (-not $proc.HasExited) {
    try {
      $lo = $proc.StandardOutput.ReadLine(); if ($null -ne $lo) { Add-Content -Path $tunnelLog -Value $lo -Encoding UTF8 }
      $le = $proc.StandardError.ReadLine(); if ($null -ne $le) { Add-Content -Path $tunnelLog -Value $le -Encoding UTF8 }
      if ($null -eq $lo -and $null -eq $le) { Start-Sleep -Milliseconds 500 }
    } catch { Start-Sleep -Milliseconds 500 }
  }
} catch {
  try { Add-Content -Path (Join-Path $AppDirParam "cloudflared.log") -Value "[$(Get-Date -Format s)] Error túnel: $($_.Exception.Message)" -Encoding UTF8 } catch { }
  exit 1
}
'@
        Set-Content -Path $tunnelHelper -Value $helperContent -Encoding UTF8
        Write-Log "Helper de túnel actualizado: $tunnelHelper"

        if (-not (Test-Path $cfExe)) {
            Write-Log "Descargando cloudflared (Quick Tunnel gratuito)..."
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                $cfUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
                Invoke-WebRequest -Uri $cfUrl -OutFile $cfExe -UseBasicParsing
                Write-Log "cloudflared descargado en $cfExe"
            } catch {
                Write-Log "No se pudo descargar cloudflared (el acceso remoto por túnel no quedará activo automáticamente): $($_.Exception.Message)" 'WARN'
            }
        } else {
            Write-Log "cloudflared ya presente: $cfExe"
        }

        # Registrar tarea programada para arranque automático (Windows) y refresco de URL al reiniciar
        if (Test-Path $cfExe) {
            try {
                $taskName = "SistemaAserraderoERPTunnel"
                $taskAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$tunnelHelper`" -AppDirParam `"$AppDir`""
                & schtasks /Create /TN $taskName /SC ONLOGON /RL HIGHEST /F /TR $taskAction *> $null
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "Tarea programada de túnel creada/actualizada: $taskName (ONLOGON)."
                } else {
                    Write-Log "No se pudo crear la tarea programada del túnel (código $LASTEXITCODE)." 'WARN'
                }
            } catch {
                Write-Log "No se pudo registrar autoarranque del túnel: $($_.Exception.Message)" 'WARN'
            }

            # Iniciar túnel ahora (best-effort) para obtener URL pública inicial
            try {
                Write-Log "Iniciando túnel cloudflared (Quick Tunnel) hacia http://localhost:$appPort ..."
                Start-Process -FilePath "powershell.exe" -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$tunnelHelper,'-AppDirParam',$AppDir,'-PortParam',[string]$appPort) -WindowStyle Hidden | Out-Null
                # Espera breve para que se genere la URL y quede en license\tunnel_url.txt
                $waitTunnel = 0
                while ($waitTunnel -lt 30 -and -not (Test-Path $tunnelUrlFile)) { Start-Sleep -Seconds 2; $waitTunnel += 2 }
                if (Test-Path $tunnelUrlFile) {
                    $pub = (Get-Content $tunnelUrlFile -Raw -ErrorAction SilentlyContinue).Trim()
                    if ($pub) { Write-Log "URL pública del túnel: $pub" }
                } else {
                    Write-Log "URL pública del túnel aún no disponible (puede demorar). Se actualizará automáticamente." 'WARN'
                }
            } catch {
                Write-Log "No se pudo iniciar el túnel automáticamente: $($_.Exception.Message)" 'WARN'
            }
        } else {
            Write-Log "Túnel cloudflared no configurado (ejecutable no disponible)." 'WARN'
        }
    } catch {
        Write-Log "Error configurando túnel cloudflared: $($_.Exception.Message)" 'WARN'
    }

    # 7) Abrir asistente de primera configuración (setup wizard)
    try {
        $setupUrl = "http://localhost:$appPort/?setup=1"
        Write-Log "Abriendo asistente de primera configuración: $setupUrl"
        Start-Process $setupUrl | Out-Null
    } catch {
        Write-Log "No se pudo abrir el navegador automáticamente: $($_.Exception.Message)" 'WARN'
    }

    Write-Log "Instalación completada. Acceso local: http://localhost:$appPort"
    Write-Host ""
    Write-Host "Sistema Aserradero ERP instalado. Acceso local: http://localhost:$appPort" -ForegroundColor Green
    Write-Host "Si corresponde, complete la primera configuración en el asistente (administrador y dirección web pública)." -ForegroundColor Green
    exit 0
}
catch {
    $msg = $_.Exception.Message
    Write-Log $msg 'ERROR'
    Show-ErrorDialog "No se pudo completar la instalación automática.`n`n$msg`n`nRevise el archivo bootstrap.log en la carpeta de instalación para más detalles."
    exit 1
}
