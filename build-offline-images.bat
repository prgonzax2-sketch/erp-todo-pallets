@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ==========================================================
REM build-offline-images.bat
REM Construye imágenes Docker de ERP y Auth y las exporta a .tar
REM para empaquetado/instalación offline (Windows).
REM Ejecutar desde la raíz del repo ERP (erp-todo-pallets).
REM ==========================================================

REM --- Configuración (override por variables de entorno) ---
if "%ERP_CONTEXT%"=="" set "ERP_CONTEXT=%~dp0"
if "%AUTH_CONTEXT%"=="" set "AUTH_CONTEXT=%~dp0..\sistema-aserradero-auth"
if "%OUT_DIR%"=="" set "OUT_DIR=%~dp0dist-installer\images"
if "%VERSION_TAG%"=="" set "VERSION_TAG=local"

REM Nombres de imagen (locales) y archivos de salida
if "%ERP_IMAGE%"=="" set "ERP_IMAGE=erp-todo-pallets:%VERSION_TAG%"
if "%AUTH_IMAGE%"=="" set "AUTH_IMAGE=sistema-aserradero-auth:%VERSION_TAG%"
set "ERP_TAR=%OUT_DIR%\erp-todo-pallets-%VERSION_TAG%.tar"
set "AUTH_TAR=%OUT_DIR%\sistema-aserradero-auth-%VERSION_TAG%.tar"

echo [offline-images] ERP_CONTEXT=%ERP_CONTEXT%
echo [offline-images] AUTH_CONTEXT=%AUTH_CONTEXT%
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
echo [1/4] Build ERP -^> %ERP_IMAGE%
docker build -t "%ERP_IMAGE%" "%ERP_CONTEXT%"
if errorlevel 1 (
  echo [ERROR] Fallo el build de la imagen ERP.
  exit /b 1
)

echo.
echo [2/4] Build Auth -^> %AUTH_IMAGE%
if not exist "%AUTH_CONTEXT%\Dockerfile" (
  echo [ERROR] No se encontro Dockerfile de Auth en: %AUTH_CONTEXT%
  echo         Ajuste AUTH_CONTEXT o clone el repo sistema-aserradero-auth como carpeta hermana.
  exit /b 1
)
docker build -t "%AUTH_IMAGE%" "%AUTH_CONTEXT%"
if errorlevel 1 (
  echo [ERROR] Fallo el build de la imagen Auth.
  exit /b 1
)

echo.
echo [3/4] Export ERP -^> %ERP_TAR%
docker save -o "%ERP_TAR%" "%ERP_IMAGE%"
if errorlevel 1 (
  echo [ERROR] Fallo docker save de ERP.
  exit /b 1
)

echo.
echo [4/4] Export Auth -^> %AUTH_TAR%
docker save -o "%AUTH_TAR%" "%AUTH_IMAGE%"
if errorlevel 1 (
  echo [ERROR] Fallo docker save de Auth.
  exit /b 1
)

echo.
echo [OK] Imagenes exportadas:
echo      %ERP_TAR%
echo      %AUTH_TAR%
echo.
echo Para cargar en un equipo destino:
echo   docker load -i erp-todo-pallets-%VERSION_TAG%.tar
echo   docker load -i sistema-aserradero-auth-%VERSION_TAG%.tar

endlocal
exit /b 0
