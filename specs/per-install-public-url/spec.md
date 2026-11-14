# Spec — URL pública propia por instalación/servidor (ERP)

## Contexto
- ERP on-prem (`erp-todo-pallets`) instalado por cliente/servidor (PC del cliente) mediante `instalador.exe` (Inno Setup → `bootstrap.ps1` + Docker Compose prod).
- Acceso **LAN**: `http://<IP-LAN>:<APP_PORT>` (plantas en la misma red). Acceso **remoto**: URL HTTPS propia del servidor bajo `sistemaaserradero.com.ar` (subdominio por cliente/instalación), publicada vía túnel/proxy (Cloudflare Tunnel) hacia `http://localhost:<APP_PORT>`.
- Estado previo: bootstrap configura **Quick Tunnel** (`cloudflared`) automático con URL efímera `https://*.trycloudflare.com` persistida en `license/tunnel_url.txt`; `/installation/setup-status` expone `publicUrl/tunnelUrl`, `main.ts` permite CORS del origen del túnel dinámico.
- Auth/licencias central (Pilar 2): independiente en `https://auth.sistemaaserradero.com.ar` (`LICENSE_SERVER_URL`), pull/JWKS/binding; **no se modifica**.

## Objetivo
Cada instalación/servidor ERP debe tener su **propia URL de acceso remoto (identidad de acceso)** configurada y persistida al instalar/configurar, reutilizable por empleados/plantas, sin colisiones entre instalaciones y sin romper licenciamiento.

## Requerimientos
1. **URL propia por instalación:** definir/persistir hostname/URL pública única (ej. `https://clienteX-erp.sistemaaserradero.com.ar`) al momento de instalar/configurar.
   - Formato aceptado: origen `https://` válido (recomendado `https://<subdominio>.sistemaaserradero.com.ar`); normalizar sin `/` final. Rechazar entradas con credenciales embebidas.
   - Evitar reutilización accidental: la URL es dato de **esta** instalación (persistida localmente en estado/volumen `license` y/o `.env`), no global; unicidad operativa se garantiza al asignar subdominio/hostname distinto por cliente en DNS/túnel central.
   - Editable de forma controlada: configurable en **setup inicial** (sin admin existente) y por **administrador autenticado** después; también preconfigurable vía `.env` (`PUBLIC_BASE_URL`/`SERVER_PUBLIC_URL`). Reinstalación que conserva `license/.env` conserva la URL; reinstalación limpia permite definir otra.
2. **Persistencia y uso en la app:**
   - Fuente de verdad runtime: `PUBLIC_BASE_URL`/`SERVER_PUBLIC_URL` (env, inyectada por compose/`.env`) con persistencia operativa en `LICENSE_STATE_PATH/server_public_url.txt` (volumen `./license`, sobrevive a reinstalación si se conserva). Si existe valor configurado, se considera la **URL propia (identidad)** del servidor.
   - Exponer en `/installation/setup-status`: `configuredPublicUrl` (identidad configurada), `dynamicTunnelUrl` (quick tunnel detectado), `publicUrl` (preferir configurada, si no dinámica, compat), `localUrl`, `lanAccessUrls`, `appPort`, `serverHostname`.
   - Uso: CORS permite origen de `configuredPublicUrl` y del túnel dinámico (`tunnel_url.txt`); UI (setup y Suscripción) muestra claramente **URL propia configurada**, **URL de túnel activa (dinámica)** y **LAN/local**.
   - La SPA funciona same-origin (rutas relativas); la URL es identidad/enlace operativo y origen CORS permitido.
3. **Publicación remota (operativa):**
   - **Automatiza el instalador/app:** captura/persistencia de la URL propia en setup (y lectura desde `.env`), visualización/compartición, CORS para ese origen, compatibilidad con quick tunnel automático existente (fallback/temporal).
   - **Manual/operativo (requiere acceso a Cloudflare del dominio central `sistemaaserradero.com.ar`):** crear/registrar túnel nombrado y DNS/hostname (CNAME) para el subdominio del cliente, y configurar `cloudflared` en la PC del cliente (token/credenciales + `config.yml` con ingress a `http://localhost:<APP_PORT>` y `service: http_status:404`). Credenciales/tokens **no** se commitean ni se embeben en imagen/instalador.
   - Mientras no exista túnel nombrado activo para esa URL, el acceso remoto puede lograrse con el quick tunnel efímero (URL distinta) o no estar disponible; la URL configurada queda como identidad/objetivo.
4. **Licenciamiento:** `LICENSE_SERVER_URL=https://auth.sistemaaserradero.com.ar`, `SIGNING_KID`/PEM, binding `machine_id_hash`/`instance_id`, verificación pull/enforcement/estados **sin cambios**. La URL pública del ERP es **dato operativo** independiente; no interactúa con claims ni con activación/binding de licencia.
5. **Multi-planta por cliente:** supuesto = **una instancia ERP por cliente/servidor** que atiende sus plantas en LAN y, opcionalmente, acceso remoto por su URL propia. Instancias separadas por planta implican instalaciones separadas, cada una con su propia URL/identidad y licencia/binding.
6. **Seguridad:** acceso remoto solo por `https://` (túnel/proxy). Recomendar Cloudflare Access/MFA o VPN; no exponer puertos del router sin endurecimiento. No persistir ni loguear secretos/tokens de túnel. Validar/sanitizar URL almacenada.

## Criterios de aceptación
- `POST /installation/server-url` persiste URL válida durante setup inicial o por admin autenticado; rechaza formatos inválidos.
- `/installation/setup-status` incluye URL configurada y dinámica diferenciadas; CORS acepta origen configurado.
- Setup UI permite definir/guardar la URL propia al instalar; Suscripción la muestra para compartir.
- `.env.example`/bootstrap soportan `PUBLIC_BASE_URL` (preconfig) sin romper flujo existente.
- Documentación operativa de alta de cliente (subdominio+túnel+URL), LAN vs remoto, checklist.
- Build/tests focales ERP OK; sin regresión de licenciamiento.

## Riesgos / notas
- Quick tunnel actual es efímero y de hostname distinto; coexiste como URL dinámica/temporal hasta configurar túnel nombrado.
- Sin acceso a credenciales/API Cloudflare central, el instalador no puede crear DNS/túnel nombrado automáticamente de punta a punta (flujo operativo documentado).
- Cambiar la URL configurada no afecta binding/licencia; actualizar DNS/túnel si cambia la infraestructura.
