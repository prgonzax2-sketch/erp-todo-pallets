@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ==========================================================
REM build-offline-images.bat
REM Construye la imagen Docker del ERP cliente y la exporta a .tar
REM para empaquetado/instalación offline (Windows).
REM NOTA: el servidor de autenticación (Auth) es centralizado/remoto y
REM NO se construye ni se distribuye a clientes.
REM Ejecutar desde la raíz del repo ERP (erp-todo-pallets).
REM ==========================================================

REM --- Configuración (override por variables de entorno) ---
if "%ERP_CONTEXT%"=="" set "ERP_CONTEXT=%~dp0"
if "%OUT_DIR%"=="" set "OUT_DIR=%~dp0dist-installer\images"
if "%VERSION_TAG%"=="" set "VERSION_TAG=local"

REM Nombre de imagen (local) y archivo de salida
if "%ERP_IMAGE%"=="" set "ERP_IMAGE=erp-todo-pallets:%VERSION_TAG%"
set "ERP_TAR=%OUT_DIR%\erp-todo-pallets-%VERSION_TAG%.tar"

echo [offline-images] ERP_CONTEXT=%ERP_CONTEXT%
echo [offline-images] OUT_DIR=%OUT_DIR%
echo [offline-images] VERSION_TAG=%VERSION_TAG%

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker no esta instalado o no esta en PATH.
  exit /b 1
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"
if errorlevel 1 (
  echo [ERROR] No se pudo crear el directorio de salida: %OUT_DIR%
  exit /b 1
)

echo.
echo [1/2] Build ERP -^> %ERP_IMAGE%
docker build -t "%ERP_IMAGE%" "%ERP_CONTEXT%"
if errorlevel 1 (
  echo [ERROR] Fallo el build de la imagen ERP.
  exit /b 1
)

echo.
echo [2/2] Export ERP -^> %ERP_TAR%
docker save -o "%ERP_TAR%" "%ERP_IMAGE%"
if errorlevel 1 (
  echo [ERROR] Fallo docker save de ERP.
  exit /b 1
)

echo.
echo [OK] Imagen exportada:
echo      %ERP_TAR%
echo.
echo Para cargar en un equipo destino:
echo   docker load -i erp-todo-pallets-%VERSION_TAG%.tar

endlocal
exit /b 0
