# bootstrap.ps1 - Instalador/arranque automatico para cliente (Sistema Aserradero ERP)
# Idempotente. Pensado para ejecucion desde setup.exe (Inno Setup) y para reanudacion tras reinicio.
# Flujo: [1] Virtualizacion -> [2] WSL 2 (+ reinicio unico si aplica) -> [3] Docker Desktop -> [4+] Configuracion y arranque.
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
    try { if ($script:LogPath) { Add-Content -Path $script:LogPath -Value $line -Encoding UTF8 } } catch { }
    Write-Host $line
}

function Write-Phase {
    param([string]$Message)
    $banner = ""
    $banner += "============================================================`r`n"
    $banner += "  $Message`r`n"
    $banner += "============================================================"
    try { if ($script:LogPath) { Add-Content -Path $script:LogPath -Value $banner -Encoding UTF8 } } catch { }
    Write-Host ""
    Write-Host $banner -ForegroundColor Cyan
}

function Show-InfoDialog {
    param([string]$Text, [string]$Title = "Sistema Aserradero ERP - Instalacion", [string]$Icon = 'Information')
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
        [System.Windows.MessageBox]::Show($Text, $Title, 'OK', $Icon) | Out-Null
    } catch { }
}

function Show-ErrorDialog {
    param([string]$Text)
    Show-InfoDialog -Text $Text -Title "Sistema Aserradero ERP - Instalacion" -Icon 'Error'
}

function New-RandomSecret {
    param([int]$Bytes = 32)
    $buf = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buf) } finally { $rng.Dispose() }
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
    param([int]$TimeoutSeconds = 900, [int]$IntervalSeconds = 5)
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        Refresh-DockerPath
        if (Test-DockerEngineReady) { return $true }
        Start-Sleep -Seconds $IntervalSeconds
        $elapsed += $IntervalSeconds
        if (($elapsed % 30) -eq 0) { Write-Log "Esperando a que Docker este listo... (${elapsed}s/${TimeoutSeconds}s)" }
    }
    return $false
}

function Get-RunOnceCommand {
    param([string]$AppDir, [string]$DesktopShortcut, [string]$GroupShortcut)
    $bootstrapPath = Join-Path $AppDir 'bootstrap.ps1'
    $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File `"$bootstrapPath`""
    if ($DesktopShortcut) { $cmd += " -DesktopShortcut `"$DesktopShortcut`"" }
    if ($GroupShortcut) { $cmd += " -GroupShortcut `"$GroupShortcut`"" }
    return $cmd
}

function Register-ResumeRunOnce {
    param([string]$AppDir, [string]$DesktopShortcut, [string]$GroupShortcut)
    $cmd = Get-RunOnceCommand -AppDir $AppDir -DesktopShortcut $DesktopShortcut -GroupShortcut $GroupShortcut
    try {
        New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'SistemaAserraderoERPBootstrap' -Value $cmd -PropertyType String -Force | Out-Null
        Write-Log "Reanudacion automatica registrada en RunOnce."
    } catch {
        Write-Log "No se pudo registrar RunOnce: $($_.Exception.Message)" 'WARN'
    }
}

function Remove-ResumeRunOnce {
    try {
        Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'SistemaAserraderoERPBootstrap' -ErrorAction SilentlyContinue
    } catch { }
}

function Test-IsVirtualizationEnabled {
    # Comprueba virtualizacion de hardware (firmware/BIOS). VirtualizationFirmwareEnabled puede ser $null en algunos equipos.
    try {
        $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop | Select-Object -First 1
        $virt = $cpu.VirtualizationFirmwareEnabled
        $hyper = $false
        try { $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue; if ($cs) { $hyper = [bool]$cs.HypervisorPresent } } catch { }
        if ($virt -eq $true) { return @{ Enabled = $true; Detail = "VirtualizationFirmwareEnabled=True" } }
        if ($virt -eq $false) {
            if ($hyper) { return @{ Enabled = $true; Detail = "HypervisorPresent=True (VirtualizationFirmwareEnabled=False)" } }
            return @{ Enabled = $false; Detail = "VirtualizationFirmwareEnabled=False" }
        }
        if ($hyper) { return @{ Enabled = $true; Detail = "HypervisorPresent=True (VirtualizationFirmwareEnabled no disponible)" } }
        return @{ Enabled = $true; Detail = "No concluyente (se continuara; Docker/WSL validaran si es necesario)" }
    } catch {
        return @{ Enabled = $true; Detail = "No se pudo comprobar (se continuara): $($_.Exception.Message)" }
    }
}

function Test-Wsl2Ready {
    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wsl) { return $false }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $statusOut = (& wsl.exe --status 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
    $statusCode = $LASTEXITCODE
    $null = (& wsl.exe -l -q 2>&1)
    $listCode = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($statusCode -eq 0) { return $true }
    if ($statusOut -match 'not installed|no está instalado|no esta instalado|habilite|enable.*feature|Wsl/InstallDistro') { return $false }
    if ($listCode -eq 0) { return $true }
    return $false
}

function Install-Wsl2Prerequisites {
    param([string]$AppDir, [string]$DesktopShortcut, [string]$GroupShortcut)
    Write-Log "WSL 2 no esta activo/listo. Se intentara instalar/habilitar (VirtualMachinePlatform + WSL)..." 'WARN'
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    Write-Log "Habilitando caracteristica Windows: VirtualMachinePlatform..."
    $dismOut = (& dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
    $dismCode = $LASTEXITCODE
    try {
        Add-Content -Path $script:LogPath -Value "--- dism VirtualMachinePlatform (codigo $dismCode) ---" -Encoding UTF8
        Add-Content -Path $script:LogPath -Value $dismOut -Encoding UTF8
    } catch { }

    Write-Log "Ejecutando: wsl --install --no-distribution"
    $wslOut = (& wsl.exe --install --no-distribution 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
    $wslCode = $LASTEXITCODE
    try {
        Add-Content -Path $script:LogPath -Value "--- wsl --install --no-distribution (codigo $wslCode) ---" -Encoding UTF8
        Add-Content -Path $script:LogPath -Value $wslOut -Encoding UTF8
    } catch { }
    $ErrorActionPreference = $prev

    Register-ResumeRunOnce -AppDir $AppDir -DesktopShortcut $DesktopShortcut -GroupShortcut $GroupShortcut

    $msg = "Se instalaron/habilitaron componentes de WSL 2 necesarios para Docker.`n`n" +
           "Para continuar automaticamente, el equipo debe REINICIARSE una sola vez.`n`n" +
           "Despues del reinicio, la instalacion continuara sola. Si no se reanuda, ejecute nuevamente el instalador.`n`n" +
           "Detalle en: $script:LogPath"
    Write-Log "Se requiere un unico reinicio de Windows para completar WSL 2." 'WARN'
    Show-InfoDialog -Text $msg -Title "Sistema Aserradero ERP - Reinicio requerido" -Icon 'Warning'
    try { & shutdown.exe /r /t 15 /c "Sistema Aserradero ERP: reinicio para completar WSL 2. La instalacion continuara automaticamente." | Out-Null } catch { }
    Write-Log "Reinicio programado (shutdown /r /t 15)."
    exit 0
}

function Ensure-DockerDesktopInstalledAndRunning {
    param([string]$AppDir)

    Refresh-DockerPath
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    $dockerExe = Get-DockerExePath

    if (-not $dockerCmd -and -not $dockerExe) {
        Write-Log "Docker Desktop no esta instalado. Instalando automaticamente..."
        $installed = $false

        $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Log "Intentando instalacion con winget (Docker.DockerDesktop)..."
            $prev = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            $wgOut = (& winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements --silent 2>&1 | ForEach-Object { $_.ToString() }) -join "`n"
            $wgCode = $LASTEXITCODE
            $ErrorActionPreference = $prev
            try {
                Add-Content -Path $script:LogPath -Value "--- winget Docker.DockerDesktop (codigo $wgCode) ---" -Encoding UTF8
                Add-Content -Path $script:LogPath -Value $wgOut -Encoding UTF8
            } catch { }
            Refresh-DockerPath
            $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
            $dockerExe = Get-DockerExePath
            if ($wgCode -eq 0 -or $dockerExe -or $dockerCmd) { $installed = $true; Write-Log "Docker Desktop instalado (winget o ya presente)." }
            else { Write-Log "winget no pudo instalar Docker Desktop (codigo $wgCode). Se usara instalador oficial como respaldo." 'WARN' }
        } else {
            Write-Log "winget no disponible. Se usara instalador oficial como respaldo." 'WARN'
        }

        if (-not $installed) {
            $installerPath = Join-Path $AppDir 'DockerDesktopInstaller.exe'
            Write-Log "Descargando instalador oficial de Docker Desktop..."
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" -OutFile $installerPath -UseBasicParsing
            } catch {
                throw "No se pudo descargar Docker Desktop. Verifique la conexion a internet e intente nuevamente. Detalle: $($_.Exception.Message)"
            }
            Write-Log "Instalando Docker Desktop de forma silenciosa..."
            $installProc = Start-Process -FilePath $installerPath -ArgumentList "install --quiet --accept-license" -Wait -NoNewWindow -PassThru
            try { Remove-Item $installerPath -Force -ErrorAction SilentlyContinue } catch { }
            if ($installProc.ExitCode -ne 0) {
                Write-Log "El instalador de Docker finalizo con codigo $($installProc.ExitCode). Puede requerir reinicio." 'WARN'
            }
            Refresh-DockerPath
            $dockerExe = Get-DockerExePath
        }
    }

    Refresh-DockerPath
    if (-not (Test-DockerEngineReady)) {
        $dockerExe = Get-DockerExePath
        if ($dockerExe) {
            Write-Log "Iniciando Docker Desktop..."
            try { Start-Process -FilePath $dockerExe | Out-Null } catch { Write-Log "No se pudo iniciar Docker Desktop automaticamente: $($_.Exception.Message)" 'WARN' }
        }
        Write-Log "Esperando a que el motor de Docker (daemon) responda antes de continuar..."
        if (-not (Wait-DockerEngineReady -TimeoutSeconds 900 -IntervalSeconds 5)) {
            $msg = "Docker Desktop no esta listo o no responde. Asegurese de que Docker Desktop este en ejecucion y vuelva a ejecutar el instalador. Revise bootstrap.log para mas detalles."
            Write-Log $msg 'ERROR'
            throw $msg
        }
    }
    Refresh-DockerPath
    if (-not (Test-DockerEngineReady)) {
        throw "Docker Desktop no esta activo. Inicie Docker Desktop y vuelva a ejecutar el instalador."
    }
    Write-Log "Docker Desktop instalado y daemon listo."
}

try {
    $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    Set-Location -Path $AppDir
    $script:LogPath = Join-Path $AppDir 'bootstrap.log'

    Write-Host ""
    Write-Host "Sistema Aserradero ERP - Instalacion/Configuracion automatica" -ForegroundColor Green
    Write-Host "Esta ventana muestra el progreso. Puede tardar varios minutos. No la cierre." -ForegroundColor Yellow
    Write-Host "Registro detallado: $script:LogPath" -ForegroundColor Gray
    Write-Host ""
    Write-Log "Inicio bootstrap. Dir: $AppDir"

    # [1] Verificar Virtualizacion de Hardware
    Write-Phase "[1/6] Verificando virtualizacion de hardware..."
    $virt = Test-IsVirtualizationEnabled
    Write-Log "Comprobacion virtualizacion: $($virt.Detail)"
    if (-not $virt.Enabled) {
        $msg = "La virtualizacion de hardware esta deshabilitada en BIOS/UEFI y es necesaria para ejecutar Docker/WSL 2.`n`n" +
               "Como habilitarla (guia general):`n" +
               "1) Reinicie el equipo e ingrese a la BIOS/UEFI (teclas comunes: F2, Supr/Del, F10 o Esc al encender).`n" +
               "2) Busque opciones de CPU/Advanced/Security: 'Intel Virtualization Technology' (VT-x) o 'SVM Mode' / 'AMD-V' y habilitela.`n" +
               "3) Guarde los cambios y reinicie Windows.`n" +
               "4) Vuelva a ejecutar el instalador de Sistema Aserradero ERP.`n`n" +
               "El nombre exacto de la opcion depende del fabricante (Intel/AMD) y del modelo de placa."
        Write-Log $msg 'ERROR'
        Show-ErrorDialog $msg
        exit 1
    }

    # [2] Verificar e instalar WSL 2 (con reanudacion y reinicio unico si falta)
    Write-Phase "[2/6] Verificando WSL 2..."
    if (-not (Test-Wsl2Ready)) {
        Install-Wsl2Prerequisites -AppDir $AppDir -DesktopShortcut $DesktopShortcut -GroupShortcut $GroupShortcut
    } else {
        Write-Log "WSL 2 activo/listo."
        Remove-ResumeRunOnce
    }

    # [3] Verificar e instalar Docker Desktop
    Write-Phase "[3/6] Verificando e instalando Docker Desktop..."
    Ensure-DockerDesktopInstalledAndRunning -AppDir $AppDir

    # [4] Preparar carpetas y configuracion
    Write-Phase "[4/6] Preparando carpetas y configuracion (.env)..."
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

    $envPath = Join-Path $AppDir '.env'
    $examplePath = Join-Path $AppDir '.env.example'
    if (-not (Test-Path $examplePath)) { throw "No se encontro .env.example en $AppDir." }
    $defaultLicenseServerUrl = 'https://auth.sistemaaserradero.com.ar'
    if (-not [string]::IsNullOrWhiteSpace($env:LICENSE_SERVER_URL)) { $defaultLicenseServerUrl = $env:LICENSE_SERVER_URL.Trim() }
    $defaultPublicBaseUrl = ''
    if (-not [string]::IsNullOrWhiteSpace($env:PUBLIC_BASE_URL)) { $defaultPublicBaseUrl = $env:PUBLIC_BASE_URL.Trim() }
    elseif (-not [string]::IsNullOrWhiteSpace($env:SERVER_PUBLIC_URL)) { $defaultPublicBaseUrl = $env:SERVER_PUBLIC_URL.Trim() }
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
        $content = Set-EnvValue -Content $content -Key 'LICENSE_SERVER_URL' -Value $defaultLicenseServerUrl
        $content = Set-EnvValue -Content $content -Key 'PUBLIC_BASE_URL' -Value $defaultPublicBaseUrl
        Set-Content -Path $envPath -Value $content -Encoding UTF8
        try {
            $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
            & icacls $envPath /inheritance:r /grant:r "${user}:(R,W)" *> $null
        } catch { }
        Write-Log ".env generado con credenciales seguras y LICENSE_SERVER_URL=$defaultLicenseServerUrl."
    } else {
        Write-Log ".env existente conservado (idempotente)."
    }

    try {
        $licenseUrl = ""
        $envContentForLicense = Get-Content -Path $envPath -Raw -Encoding UTF8
        $mLic = [regex]::Match($envContentForLicense, '(?m)^\s*LICENSE_SERVER_URL\s*=\s*(.*)$')
        if ($mLic.Success) { $licenseUrl = $mLic.Groups[1].Value.Trim().Trim('"').Trim("'") }
        if ([string]::IsNullOrWhiteSpace($licenseUrl)) {
            Write-Log "ADVERTENCIA: LICENSE_SERVER_URL no esta configurado." 'WARN'
        } elseif ($licenseUrl -match 'localhost|127\.0\.0\.1|host\.docker\.internal') {
            Write-Log "ADVERTENCIA: LICENSE_SERVER_URL apunta a direccion local ($licenseUrl). Para uso remoto configure la URL central HTTPS." 'WARN'
        }
    } catch { Write-Log "No se pudo verificar LICENSE_SERVER_URL: $($_.Exception.Message)" 'WARN' }

    # [5] Levantar stack
    Write-Phase "[5/6] Descargando e iniciando servicios Docker (docker compose up -d)..."
    Write-Host "  - Puede tardar varios minutos segun la conexion e imagenes. Detalle en bootstrap.log." -ForegroundColor Gray
    $composeFile = Join-Path $AppDir 'docker-compose.prod.yml'
    if (-not (Test-Path $composeFile)) { throw "No se encontro docker-compose.prod.yml en $AppDir." }
    Refresh-DockerPath
    if (-not (Test-DockerEngineReady)) { throw "Docker no esta activo. No se puede ejecutar docker compose." }

    $composeCmdDisplay = 'docker compose -f "docker-compose.prod.yml" --env-file ".env" up -d --pull always'
    $composeArgs = @('compose', '-f', 'docker-compose.prod.yml', '--env-file', '.env', 'up', '-d', '--pull', 'always')
    $maxAttempts = 3
    $composeOk = $false
    $lastExitCode = 1
    $lastOutput = ""
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        Write-Log "Iniciando servicios (intento $attempt de $maxAttempts): $composeCmdDisplay"
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $outputLines = & docker @composeArgs 2>&1
        $lastExitCode = $LASTEXITCODE
        $ErrorActionPreference = $prevEap
        $lastOutput = ($outputLines | ForEach-Object { $_.ToString() }) -join "`r`n"
        if ($lastOutput) {
            try {
                Add-Content -Path $script:LogPath -Value "--- Salida docker compose (intento $attempt, codigo $lastExitCode) ---" -Encoding UTF8
                Add-Content -Path $script:LogPath -Value $lastOutput -Encoding UTF8
                Add-Content -Path $script:LogPath -Value "--- Fin salida intento $attempt ---" -Encoding UTF8
            } catch { }
        }
        if ($lastExitCode -eq 0) { $composeOk = $true; break }
        Write-Log "docker compose fallo en intento $attempt con codigo $lastExitCode." 'WARN'
        if ($attempt -lt $maxAttempts) {
            Start-Sleep -Seconds 5
            Refresh-DockerPath
        }
    }
    if (-not $composeOk) {
        Write-Log "Fallo persistente: $composeCmdDisplay (codigo $lastExitCode)" 'ERROR'
        throw "No se pudo iniciar el sistema tras $maxAttempts intentos (docker compose codigo $lastExitCode). Revise bootstrap.log."
    }
    Write-Log "Servicios iniciados correctamente."

    # Accesos directos (puerto)
    $appPort = "3000"
    $envFile = Join-Path $AppDir ".env"
    if (Test-Path -LiteralPath $envFile) {
        $envMatch = Select-String -Path $envFile -Pattern "^APP_PORT\s*=\s*['`"]?(.*?)['`"]?\s*(?:#.*)?$" -ErrorAction SilentlyContinue
        if ($envMatch) { $parsedPort = $envMatch.Matches.Groups[1].Value.Trim(); if ($parsedPort -match "^\d+$") { $appPort = $parsedPort } }
    }
    foreach ($sc in @($DesktopShortcut, $GroupShortcut)) {
        if ($sc -and (Test-Path -LiteralPath $sc)) {
            try {
                $contentSc = Get-Content -Path $sc -Raw
                if ($contentSc -match "PORT_PLACEHOLDER") {
                    Set-Content -Path $sc -Value ($contentSc -replace "PORT_PLACEHOLDER", $appPort) -Encoding Ascii -Force
                    Write-Log "Acceso directo actualizado: $sc"
                }
            } catch { Write-Log "No se pudo actualizar acceso directo: $sc. $($_.Exception.Message)" 'WARN' }
        }
    }

    # [6] Tunel remoto (best-effort) y asistente
    Write-Phase "[6/6] Configurando acceso remoto (opcional) y abriendo asistente..."
    try {
        $toolsDir = Join-Path $AppDir 'tools'
        $cfDir = Join-Path $toolsDir 'cloudflared'
        $cfExe = Join-Path $cfDir 'cloudflared.exe'
        $licenseDir = Join-Path $AppDir 'license'
        $tunnelUrlFile = Join-Path $licenseDir 'tunnel_url.txt'
        $tunnelLog = Join-Path $AppDir 'cloudflared.log'
        $tunnelHelper = Join-Path $AppDir 'start-tunnel.ps1'
        if (-not (Test-Path $cfDir)) { New-Item -ItemType Directory -Path $cfDir -Force | Out-Null }

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
  while (-not $proc.HasExited) {
    try {
      $lo = $proc.StandardOutput.ReadLine(); if ($null -ne $lo) { Add-Content -Path $tunnelLog -Value $lo -Encoding UTF8 }
      $le = $proc.StandardError.ReadLine(); if ($null -ne $le) { Add-Content -Path $tunnelLog -Value $le -Encoding UTF8 }
      if ($null -eq $lo -and $null -eq $le) { Start-Sleep -Milliseconds 500 }
    } catch { Start-Sleep -Milliseconds 500 }
  }
} catch {
  try { Add-Content -Path (Join-Path $AppDirParam "cloudflared.log") -Value "[$(Get-Date -Format s)] Error tunel: $($_.Exception.Message)" -Encoding UTF8 } catch { }
  exit 1
}
'@
        Set-Content -Path $tunnelHelper -Value $helperContent -Encoding UTF8
        if (-not (Test-Path $cfExe)) {
            Write-Log "Descargando cloudflared (tunel remoto gratuito)..."
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfExe -UseBasicParsing
            } catch { Write-Log "No se pudo descargar cloudflared (acceso remoto automatico no disponible): $($_.Exception.Message)" 'WARN' }
        }
        if (Test-Path $cfExe) {
            try {
                $taskName = "SistemaAserraderoERPTunnel"
                $taskAction = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$tunnelHelper`" -AppDirParam `"$AppDir`""
                & schtasks /Create /TN $taskName /SC ONLOGON /RL HIGHEST /F /TR $taskAction *> $null
                if ($LASTEXITCODE -eq 0) { Write-Log "Tarea programada de tunel creada/actualizada: $taskName." }
            } catch { Write-Log "No se pudo registrar autoarranque del tunel: $($_.Exception.Message)" 'WARN' }
            try {
                Start-Process -FilePath "powershell.exe" -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$tunnelHelper,'-AppDirParam',$AppDir,'-PortParam',[string]$appPort) -WindowStyle Hidden | Out-Null
                $waitTunnel = 0
                while ($waitTunnel -lt 30 -and -not (Test-Path $tunnelUrlFile)) { Start-Sleep -Seconds 2; $waitTunnel += 2 }
                if (Test-Path $tunnelUrlFile) {
                    $pub = (Get-Content $tunnelUrlFile -Raw -ErrorAction SilentlyContinue).Trim()
                    if ($pub) { Write-Log "URL publica del tunel: $pub" }
                } else { Write-Log "URL publica del tunel aun no disponible (se actualizara automaticamente)." 'WARN' }
            } catch { Write-Log "No se pudo iniciar el tunel automaticamente: $($_.Exception.Message)" 'WARN' }
        }
    } catch { Write-Log "Error configurando tunel cloudflared: $($_.Exception.Message)" 'WARN' }

    Remove-ResumeRunOnce

    # Esperar a que la app responda antes de abrir el navegador (evita fallos en reinstalaciones/arranques lentos)
    $setupUrl = "http://localhost:$appPort/?setup=1"
    $statusUrl = "http://localhost:$appPort/installation/setup-status"
    $appReady = $false
    Write-Log "Esperando a que el sistema web responda en http://localhost:$appPort ..."
    $waitApp = 0
    while ($waitApp -lt 180 -and -not $appReady) {
        try {
            $r = Invoke-WebRequest -Uri $statusUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $appReady = $true }
        } catch {
            try {
                $r2 = Invoke-WebRequest -Uri "http://localhost:$appPort/" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
                if ($r2.StatusCode -ge 200 -and $r2.StatusCode -lt 600) { $appReady = $true }
            } catch { }
        }
        if (-not $appReady) { Start-Sleep -Seconds 3; $waitApp += 3 }
    }
    if ($appReady) { Write-Log "Sistema web listo. Abriendo asistente/navegador." }
    else { Write-Log "El sistema web no confirmo disponibilidad a tiempo; se intentara abrir el navegador de todos modos." 'WARN' }

    $opened = $false
    for ($i = 1; $i -le 3 -and -not $opened; $i++) {
        try {
            Start-Process $setupUrl | Out-Null
            $opened = $true
            Write-Log "Navegador abierto en $setupUrl"
        } catch {
            try { cmd /c start "" "$setupUrl" | Out-Null; $opened = $true; Write-Log "Navegador abierto (cmd start) en $setupUrl" } catch { Write-Log "Intento $i: no se pudo abrir el navegador: $($_.Exception.Message)" 'WARN' }
        }
        if (-not $opened -and $i -lt 3) { Start-Sleep -Seconds 2 }
    }

    Write-Log "Instalacion completada. Acceso local: http://localhost:$appPort"
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  Instalacion completada correctamente" -ForegroundColor Green
    Write-Host "  Acceso local: http://localhost:$appPort" -ForegroundColor Green
    Write-Host "  Registro: $script:LogPath" -ForegroundColor Gray
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "Si corresponde, complete la primera configuracion en el asistente." -ForegroundColor Green
    Write-Host "Esta ventana se cerrara en unos segundos..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 6
    exit 0
}
catch {
    $msg = $_.Exception.Message
    Write-Log $msg 'ERROR'
    Show-ErrorDialog "No se pudo completar la instalacion automatica.`n`n$msg`n`nRevise bootstrap.log en la carpeta de instalacion."
    exit 1
}

