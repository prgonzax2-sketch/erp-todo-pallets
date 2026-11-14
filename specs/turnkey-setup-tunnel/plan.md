# Plan — Turnkey setup/túnel/primer admin

## Backend
- `src/installation/installation.module.ts|controller.ts|service.ts` o integrar en licensing: usar controlador `@Controller('installation')` con endpoints públicos:
  - `GET /installation/setup-status`: `{ needsSetup, hasAdmin, localUrl, publicUrl, tunnelUrl, appPort }` (lee tunnel desde `LICENSE_STATE_PATH/tunnel_url.txt`).
  - `POST /installation/setup-admin`: body `{ email, password, nombre? }`, solo si no hay admin activo; crea Usuario admin (email lowercased, bcrypt), marca estado instalación; retorna ok + usuario básico.
- Whitelist LicenseGuard: `/installation*` y `/setup` SPA.
- `main.ts`: SPA entry incluye `/setup`; CORS dinámico función que permite origins de `CORS_ORIGINS` + origen del tunnel URL leído de archivo (cache corta). Exponer/permitir credenciales según necesidad.
- Utilidad lectura tunnel URL compartida.

## Frontend (index.html)
- Vista `#vista-setup` (overlay) similar a activación: muestra URL pública túnel (copiable, grande) + URL local, estado túnel; formulario crear admin (email, contraseña, confirmar) y botón crear+entrar (login automático).
- Lógica: al cargar (y en flujo) consultar `/installation/setup-status`; si `needsSetup` mostrar setup (prioridad con activación según flujo), tras crear admin hacer login y continuar. Mostrar enlace túnel activo en área admin/config.

## Instalador (Windows)
- `bootstrap.ps1`: gestionar cloudflared en `{app}\tools\cloudflared\cloudflared.exe` (descarga si falta), ejecutar quick tunnel `tunnel --url http://localhost:$appPort --no-autoupdate` capturando URL `https://...trycloudflare.com` desde stdout/log, guardar en `license\tunnel_url.txt` y `cloudflared.log`; crear tarea programada (ONLOGON) o mecanismo de arranque automático para relanzar túnel y refrescar URL; abrir navegador a `http://localhost:$appPort/?setup=1` al finalizar.
- `setup.iss`: sin cambios mayores salvo consistencia; bootstrap realiza lógica.

## Verificación
- `npm run build`, tests focalizados (licensing + auth si aplica), revisión de flujo.
