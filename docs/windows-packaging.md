# Empaquetado Windows (Inno Setup) — `setup.exe` de un solo clic

Este documento describe cómo **compilar** y **distribuir** el instalador Windows (`SistemaAserraderoERP-Setup.exe`) para `erp-todo-pallets`. La instalación manual por consola está deprecada; el cliente instala mediante `setup.exe`.

## Objetivo de experiencia (cliente final)
El cliente ejecuta el instalador, sigue las instrucciones y el sistema queda listo:
1. El instalador intenta **instalar/iniciar Docker Desktop** si no está disponible (requiere internet para descargarlo la primera vez en un equipo sin Docker).
2. Genera `.env` local con credenciales seguras, crea carpetas (`dbdata`, `backups`, `license`) y levanta el sistema con Docker Compose.
3. El cliente abre el acceso directo (`http://localhost:APP_PORT`), **crea su usuario admin** (primer inicio, según flujo de la app), ingresa la **licencia** y comienza a operar.

> Nota: la primera instalación puede tardar varios minutos (descarga/instalación/inicio de Docker + descarga de la imagen). En algunos equipos Docker Desktop puede requerir configuración inicial o reinicio; si el bootstrap no puede completar, el cliente debe abrir Docker Desktop, dejarlo en ejecución y volver a ejecutar el instalador (idempotente).

## Requisitos del desarrollador (máquina de build)
- **Windows 10/11**.
- **[Inno Setup 6.x](https://jrsoftware.org/isinfo.php)** (`ISCC.exe` / `Compil32.exe`).
- Artefactos actualizados:
  - `deploy/docker-compose.prod.yml` (imagen/tag a desplegar)
  - `.env.example` (config base: `LICENSE_SERVER_URL`, `LICENSE_PUBLIC_KEY_PEM`, etc.)
  - `deploy/windows-installer/bootstrap.ps1`
  - `deploy/windows-installer/setup.iss`

## Qué empaqueta el instalador
`setup.iss` copia a `{app}`: `docker-compose.prod.yml`, `.env.example`, `bootstrap.ps1`, `actualizar.ps1`.  
Salida: `dist-installer\SistemaAserraderoERP-Setup.exe`.

El instalador **no** incluye el código fuente ni credenciales de registro. En tiempo de instalación descarga la imagen definida en `docker-compose.prod.yml` (`APP_IMAGE`/`APP_IMAGE_TAG`).

## Distribución multi-cliente y operación remota (contrato Auth↔ERP)

- **Servidor de licencias remoto (Pilar 1):** debe estar desplegado y **accesible** desde los clientes (URL estable, preferentemente **HTTPS/TLS**, DNS/firewall). Exponer `POST /v1/license/verify` y `GET /.well-known/license-jwks.json`. (Requisito de despliegue/infra, no del instalador.)
- **Configuración obligatoria:** `LICENSE_SERVER_URL` = URL base del Auth central alcanzable desde el ERP (**no usar `localhost`/`127.0.0.1`/`host.docker.internal`** en clientes remotos). `LICENSE_PUBLIC_KEY_PEM` = clave pública (SPKI, RS256) del firmante activo, `kid` coherente (actual confirmado: `prod-20261111`).
- **Estado actual (Autorización A y B):** intervalo `1800000` ms (30 min) y PEM/kid `prod-20261111` aplicados en plantillas/docs; **`LICENSE_SERVER_URL` HTTPS oficial pendiente de provisión** (`.env.example` conserva valor de prueba local hasta recibir la URL real) y `API_ISSUER` oficial pendiente de confirmación para coherencia de entorno. Plantilla: `specs/licensing-remote-contract/paquete-definitivo.template.env`. Reemplazar URL antes de distribuir.
- **Modelo:** verificación **pull** (sin push). Revocación/suspensión se refleja en la **próxima verificación exitosa**. Si el Auth es inalcanzable, el ERP conserva el último estado válido (vigencia/gracia/anti-rollback) y **no** lo trata como revocado. Intervalo configurado **1800000 ms (30 min, SLA indicado)**; mínimo 60s. URL HTTPS oficial pendiente de ingreso.
- **Rotación de clave:** con pin PEM estático en ERP, actualizar `LICENSE_PUBLIC_KEY_PEM` en clientes dentro de la ventana de solapamiento (Auth publica claves previas en JWKS).
- **Activación en sitio remoto:** levantar stack → en `/activacion` copiar `machine_id_hash`/`instance_id` → obtener token JWS del mismo binding (admin Auth) y activarlo; con conectividad, `check-now`/periódico sincroniza.

## Distribución (imagen y seguridad)
- **Imagen accesible sin secretos:** publicar la imagen en GHCR como **pública** (o paquete offline `docker save/load`). **No** incluir PAT/tokens en `bootstrap.ps1` ni en el `.exe`.
- **Versión trazable:** fijar `APP_IMAGE_TAG` y `APP_VERSION` por release.
- **Seguridad:** revocar/rotar cualquier token previamente embebido; no distribuir ejecutables con secretos.

## Compilación
### IDE
1. Abrir `deploy\windows-installer\setup.iss` en Inno Setup Compiler.
2. `Build > Compile` (F9) → genera `dist-installer\SistemaAserraderoERP-Setup.exe`.

### Línea de comandos
```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" ".\deploy\windows-installer\setup.iss"
```

## Comportamiento en el equipo cliente
1. Ejecuta `SistemaAserraderoERP-Setup.exe` (privilegios de administrador).
2. Copia archivos y crea accesos directos (abrir sistema y **Actualizar Sistema Aserradero ERP**). URL ajustada según `.env`/`APP_PORT`.
3. Ejecuta `bootstrap.ps1` (oculto, idempotente): verifica/instala/inicia Docker, espera motor listo, crea `dbdata/backups/license`, genera `.env` si falta (DB/JWT aleatorios), advierte si `LICENSE_SERVER_URL` está vacío o es local, ejecuta `docker compose -f docker-compose.prod.yml --env-file .env up -d --pull always`, actualiza accesos directos. Log: `{app}\bootstrap.log`.
4. Actualización: acceso directo **Actualizar Sistema Aserradero ERP** (`actualizar.ps1`) o `docker compose ... pull && up -d`. Log: `{app}\actualizar.log`.

## Requisitos del equipo cliente
- **Windows** con Docker Desktop (instalador intenta instalarlo/iniciarlo; puede requerir reinicio/aceptación de términos).
- **Internet** para Docker Desktop (si falta) y descarga de imagen (salvo offline).
- **Conectividad al servidor de licencias** (URL remota) para verificación/activación online.
- Puerto `APP_PORT` disponible (default `3000`).

## Notas operativas
- `.env` se genera localmente; no se eliminan `dbdata`, `backups`, `license`, `.env` en desinstalación.
- Tras cambios en compose, `.env.example` o `bootstrap.ps1`, **recompilar** el `setup.exe` y validar en VM/host limpio.
- Inicio manual (carpeta `{app}`): `docker compose -f docker-compose.prod.yml up -d`

## Referencias
- Contrato remoto: `specs/licensing-remote-contract/{CONTRATO_Y_GAP,plan,tasks}.md`
- Licenciamiento: `docs/licenciamiento.md`
- `deploy/windows-installer/setup.iss`, `deploy/windows-installer/bootstrap.ps1`
- `deploy/docker-compose.prod.yml`, `.env.example`