# Empaquetado Windows (Inno Setup) — `setup.exe` de un solo clic (F3.6)

Este documento describe cómo **compilar** el instalador Windows (`SistemaAserraderoERP-Setup.exe`) para `erp-todo-pallets`. La instalación manual por consola (`install.sh` / `install.bat`) está **deprecada y eliminada**; el cliente instala mediante el `setup.exe` proporcionado.

## Requisitos del desarrollador (máquina de build)
- **Windows 10/11** (recomendado).
- **[Inno Setup 6.x](https://jrsoftware.org/isinfo.php)** instalado (incluye compilador `ISCC.exe` y/o IDE `Compil32.exe`).
- Repositorio `erp-todo-pallets` con los artefactos de despliegue actualizados:
  - `deploy/docker-compose.prod.yml`
  - `.env.example` (raíz)
  - `deploy/windows-installer/bootstrap.ps1`
  - `deploy/windows-installer/setup.iss`

> No se requieren Node.js ni Docker para compilar el instalador, pero sí son necesarios en el **equipo cliente** (Docker Desktop activo) para que el bootstrap levante el sistema.

## Qué empaqueta el instalador
`deploy/windows-installer/setup.iss` copia a la carpeta de instalación (`{app}`):
- `docker-compose.prod.yml`
- `.env.example`
- `bootstrap.ps1` (helper interno, no expuesto como flujo manual)

Salida del compilador: `dist-installer\SistemaAserraderoERP-Setup.exe` (ruta relativa al repo, configurable en `OutputDir`).

## Compilación

### Opción A — IDE (recomendada)
1. Abrir **Inno Setup Compiler** (`Compil32.exe`).
2. `File > Open...` → seleccionar `deploy\windows-installer\setup.iss`.
3. `Build > Compile` (o `F9`).
4. Verificar el artefacto generado en `dist-installer\SistemaAserraderoERP-Setup.exe`.

### Opción B — Línea de comandos (`ISCC.exe`)
Desde PowerShell en la raíz del repo (ajustar ruta de Inno Setup si difiere):

```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" ".\deploy\windows-installer\setup.iss"
```

Código de salida `0` indica compilación exitosa.

## Comportamiento en el equipo cliente (un solo clic)
1. El usuario ejecuta `SistemaAserraderoERP-Setup.exe`.
2. El instalador copia los archivos a `{app}` y crea (según tarea) el acceso directo **"Sistema Aserradero ERP"** en el Escritorio apuntando a `http://localhost:3000`.
3. En `[Run]`, Inno ejecuta **oculto** (`runhidden`):
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{app}\bootstrap.ps1"`
4. `bootstrap.ps1` (idempotente) realiza:
   - Verificación de **Docker activo** (`docker info`); si falla, registra error y muestra aviso.
   - Creación de carpetas estructurales: `dbdata`, `backups`, `license`.
   - Si no existe `.env`: copia `.env.example` → `.env` y **autogenera credenciales seguras** (`DB_PASSWORD/POSTGRES_PASSWORD`, `JWT_SECRET`), preservando configuración de piloto/licenciamiento y clave pública pinneada del ejemplo.
   - Ejecución de `docker compose -f docker-compose.prod.yml up -d`.
   - Log en `{app}\bootstrap.log`.

## Requisitos del equipo cliente
- **Docker Desktop** instalado y **en ejecución** (daemon activo) antes o durante la instalación.
- Conectividad para descargar la imagen configurada en `.env`/compose (por defecto GHCR, `APP_IMAGE`/`APP_IMAGE_TAG`).
- Puertos disponibles según `APP_PORT` (default `3000`).

## Notas operativas y seguridad
- **No se empaquetan secretos privados.** `.env` se genera localmente en el cliente; `.env.example` incluye solo clave pública RSA pinneada y valores de piloto (`LICENSE_ENFORCEMENT=grace`, `UPDATES_AUTO_ENABLED=false`).
- **Desinstalación:** el script no elimina `dbdata`, `backups`, `license` ni `.env` para evitar pérdida de datos; solo se elimina `bootstrap.log` (ver `[UninstallDelete]`).
- Para actualizaciones del empaquetado, regenerar el `setup.exe` tras cambios en compose, `.env.example` o `bootstrap.ps1` y validar en host limpio/VM.

## Referencias
- Script: `deploy/windows-installer/setup.iss`, `deploy/windows-installer/bootstrap.ps1`
- Despliegue: `deploy/docker-compose.prod.yml`, `.env.example`
- Licenciamiento/piloto: `docs/licenciamiento.md`, `specs/licenciamiento-actualizaciones-onprem/tasks.md`
