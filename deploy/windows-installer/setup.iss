; setup.iss - Inno Setup (F3.6) - Sistema Aserradero ERP
; Compilar con Inno Setup 6.x (ISCC.exe o IDE). Ver docs/windows-packaging.md

#define MyAppName "Sistema Aserradero ERP"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "ERP Todo Pallets"
#define MyAppURL "http://localhost:3000"
#define MyAppExeName "bootstrap.ps1"

[Setup]
AppId={{A7F0D5E2-6C3B-4D91-9F3A-1B2C4D5E6F70}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Requiere privilegios para instalar en Program Files y crear accesos comunes si aplica
PrivilegesRequired=admin
OutputDir=..\..\dist-installer
OutputBaseFilename=SistemaAserraderoERP-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el Escritorio"; GroupDescription: "Accesos directos:"; Flags: unchecked

[Files]
; Empaquetar artefactos de despliegue y helpers internos
Source: "..\docker-compose.prod.yml"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\.env.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "bootstrap.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "actualizar.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{commondesktop}\Sistema Aserradero ERP"; Filename: "http://localhost:PORT_PLACEHOLDER"; Tasks: desktopicon
Name: "{group}\Sistema Aserradero ERP"; Filename: "http://localhost:PORT_PLACEHOLDER"
Name: "{group}\Actualizar Sistema Aserradero ERP"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\actualizar.ps1"""; WorkingDir: "{app}"

[Run]
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\bootstrap.ps1"" -DesktopShortcut ""{commondesktop}\Sistema Aserradero ERP.url"" -GroupShortcut ""{group}\Sistema Aserradero ERP.url"""; \
  WorkingDir: "{app}"; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Configurando Docker, entorno y servicios (puede tardar varios minutos)..."

[UninstallDelete]
; No borrar datos persistentes por defecto (dbdata/backups/license/.env). Desinstalación segura.
; Type: filesandordirs; Name: "{app}\dbdata"  ; (omitido intencionalmente)
; Type: filesandordirs; Name: "{app}\backups" ; (omitido intencionalmente)
; Type: filesandordirs; Name: "{app}\license" ; (omitido intencionalmente)
; Type: files; Name: "{app}\.env"             ; (omitido intencionalmente)
Type: files; Name: "{app}\bootstrap.log"
Type: files; Name: "{app}\actualizar.log"

[Code]
// Notas:
// - bootstrap.ps1: instala/inicia Docker Desktop si es necesario, genera .env, levanta el stack (sin credenciales embebidas; la imagen debe ser accesible/pública o proveerse offline).
// - actualizar.ps1: permite descargar y aplicar actualizaciones de la imagen configurada en docker-compose.prod.yml.
