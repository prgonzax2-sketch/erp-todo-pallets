# Tasks — Turnkey setup/túnel/primer admin

- [x] **T1 Backend setup/status y primer admin:** `InstallationModule` + `GET /installation/setup-status` (needsSetup, publicUrl/tunnelUrl desde `LICENSE_STATE_PATH/tunnel_url.txt`, localUrl) + `POST /installation/setup-admin` (solo si no hay admin activo; crea admin y marca `app_installation_state`). Whitelist `/installation*` y `/setup` en `LicenseGuard`; SPA entry `/setup` en `main.ts`.
- [x] **T2 CORS dinámico:** `main.ts` permite orígenes de `CORS_ORIGINS` y origen del túnel activo leído de `tunnel_url.txt` (cache), manteniendo restricción para orígenes no autorizados.
- [x] **T3 Frontend wizard y visibilidad túnel:** `index.html` vista `#vista-setup` (URL pública/local con copiar, formulario crear admin + login automático), auto-muestra si `needsSetup`; bloque túnel/URL local en vista Suscripción/administración. Script `setup*` integrado.
- [x] **T4 Instalador/túnel cloudflared:** `bootstrap.ps1` descarga/usa `cloudflared.exe` en `tools\cloudflared`, helper `start-tunnel.ps1` (quick tunnel a `localhost:APP_PORT`, captura URL `*.trycloudflare.com` → `license\tunnel_url.txt`), tarea programada `SistemaAserraderoERPTunnel` (ONLOGON) para arranque automático/renovación URL, inicio best-effort y apertura de `/?setup=1`.
- [x] **T5 Verificación:** `npm run build` OK; `npx vitest run src/licensing/licensing.service.spec.ts` 14/14 PASS.
- [x] **T6 Confirmación auth intermitente:** `LicensingService.verifyNow` preserva estado efectivo previo ante fallo de red (solo `lastError/checkAt`) y `evaluateAccess` permite en vigencia/gracia con evidencia previa (sin tamper), por lo que opera autónomo sin Auth central y sincroniza por pull en próxima verificación exitosa (arranque/periódico/check-now) cuando el servidor vuelve.

## Notas
- URL de quick tunnel efímera (cambia al reiniciar túnel/PC); se refresca en `license\tunnel_url.txt` y UI la consulta periódicamente.
- Primer admin creado vía `/installation/setup-admin` (email+contraseña, rol admin) solo mientras no exista admin activo.
