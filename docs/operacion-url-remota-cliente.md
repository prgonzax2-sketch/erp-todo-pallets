# Operación: URL propia por instalación (LAN y acceso remoto)

Guía operativa para dar de alta un cliente/servidor ERP con su **propia URL de acceso remoto** (subdominio por instalación) bajo `sistemaaserradero.com.ar`, manteniendo acceso LAN y la integración de licenciamiento intacta.

## 1. Modelo y alcance

- **1 servidor/instalación ERP por cliente** (PC/servidor on-prem del cliente). Cada instalación tiene su propia identidad operativa (URL configurada), su propia base de datos/estado y su propia licencia/binding (`machine_id_hash`/`instance_id`).
- **Plantas/sucursales en la misma red (LAN):** acceden por `http://<IP-LAN>:<APP_PORT>` (ej. `http://192.168.x.x:3000`). Requiere que las PCs estén en la misma red/subred y que el Firewall de Windows del servidor permita conexiones entrantes TCP en `APP_PORT`.
- **Acceso desde otra red (remoto):** por `https://<subdominio-cliente>.sistemaaserradero.com.ar`, publicado mediante **Cloudflare Tunnel** (`cloudflared`) desde la PC del cliente hacia `http://localhost:<APP_PORT>` (sin abrir puertos del router). Disponible solo si el túnel/servicio está activo en esa instalación.
- **Multi-planta por cliente:** supuesto soportado = una instancia ERP por cliente que atiende sus plantas (LAN y, si aplica, remoto por su URL). Instancias separadas por planta implican instalaciones ERP separadas, cada una con subdominio/URL, estado y licencia propios.

## 2. Identidad de acceso (URL propia) y persistencia

- **Campo:** `PUBLIC_BASE_URL` (alias `SERVER_PUBLIC_URL`) — URL HTTPS propia del servidor, ej. `https://clienteX-erp.sistemaaserradero.com.ar`.
- **Dónde se configura/persiste:**
  - **Asistente de primera configuración** (`/setup`) o **Configuración → Mi Suscripción** (admin): campo “URL propia del servidor”, guardado vía `POST /installation/server-url`.
  - **Persistencia local:** `LICENSE_STATE_PATH/server_public_url.txt` (volumen `./license`, se conserva en reinstalaciones que preservan datos).
  - **Preconfiguración:** variable `PUBLIC_BASE_URL` en `.env` (inyectada por `docker-compose.prod.yml`). `.env.example` incluye la clave.
- **Formato:** origen `https://` válido (sin credenciales, sin path relevante). La URL configurada es la **identidad/enlace operativo** de esa instalación y se habilita como origen CORS permitido.
- **Unicidad/colisiones:** la app persiste la URL de *esta* instalación; la unicidad global se garantiza operativamente asignando un **subdominio/hostname distinto por cliente** en el DNS/túnel central (no reutilizar el mismo hostname en otra instalación activa).
- **Edición/reinstalación:** editable de forma controlada desde el asistente (instalación inicial) o por administrador en Suscripción. Reinstalar conservando `license/` y `.env` conserva la URL/identidad y datos; reinstalación limpia (sin esos datos) permite definir una nueva URL/identidad.

## 3. Alta de un nuevo cliente (subdominio + túnel + URL)

### 3.1 Definir identificador/hostname único
- Elegir un subdominio único por cliente/instalación, ej.: `cliente-<slug>-erp.sistemaaserradero.com.ar` o `<cliente>-erp.sistemaaserradero.com.ar`.
- Registrar/confirmar que no esté en uso por otra instalación activa.

### 3.2 Configurar la URL en la instalación (automatizado por ERP/instalador)
- Ejecutar `instalador.exe` / `bootstrap.ps1` y completar el **asistente de primera configuración**.
- Ingresar y **guardar la “URL propia del servidor”** (`https://<subdominio>.sistemaaserradero.com.ar`) en el asistente (o luego en Suscripción como admin). Opcionalmente preconfigurar `PUBLIC_BASE_URL` en `.env` antes de levantar.
- Compartir con los empleados: URL LAN (misma red) y/o la URL propia remota (cuando el túnel esté publicado).

### 3.3 Materializar la URL pública (operativo, acceso a Cloudflare central)
> Requiere acceso a la cuenta/zonas Cloudflare del dominio `sistemaaserradero.com.ar`. **No** commitear ni distribuir secretos/tokens.

1. **Crear túnel nombrado** (una vez por cliente/instalación) en la infraestructura/PC del cliente con `cloudflared` (autenticado con credenciales del operador central según política: `tunnel login`/token de túnel provisto):
   - `cloudflared tunnel create <nombre-unico-cliente>`
2. **Publicar DNS/hostname** para el subdominio hacia el túnel (CNAME/route):
   - `cloudflared tunnel route dns <nombre-unico-cliente> <subdominio-cliente>.sistemaaserradero.com.ar`
3. **Configurar `config.yml`** en la PC del cliente apuntando al ERP local (puerto `APP_PORT`, por defecto 3000):
   ```yaml
   tunnel: <TUNNEL-UUID-o-nombre>
   credentials-file: <ruta-a-credentials.json-o-usar-token-según-método>
   ingress:
     - hostname: <subdominio-cliente>.sistemaaserradero.com.ar
       service: http://localhost:3000
     - service: http_status:404
   ```
4. **Ejecutar el túnel como servicio** en la PC del cliente (para que inicie con Windows): `cloudflared service install` / `cloudflared tunnel run <nombre-unico-cliente>` según el método elegido (token o credenciales). Verificar que el hostname resuelva y responda por HTTPS.
5. **Firewall/LAN:** no es necesario abrir puertos del router; el firewall local debe permitir tráfico saliente de `cloudflared` y el ERP local en `localhost`.

### 3.4 Coexistencia con Quick Tunnel (automático, temporal)
- El instalador/bootstrap actual puede iniciar un **Quick Tunnel** (`trycloudflare.com`, URL efímera) y el ERP lo expone como “URL pública dinámica (túnel activo)”. Es útil como acceso remoto temporal/fallback.
- La **URL propia configurada** es la identidad estable por cliente; una vez publicado el túnel nombrado + DNS para ese subdominio, esa URL propia pasa a ser el acceso remoto definitivo (siempre que el túnel nombrado esté activo en la PC del cliente).
- `publicUrl` en `setup-status` prioriza la URL configurada y, si no existe, la dinámica (compatibilidad).

## 4. Checklist de verificación (por instalación)

- [ ] **LAN:** desde otra PC de la misma red, `http://<IP-LAN>:<APP_PORT>` carga el ERP (Firewall de Windows del servidor permite el puerto, IP reservada/fija recomendada).
- [ ] **URL propia guardada:** en `/setup` o Suscripción aparece la URL configurada y se copia correctamente; `/installation/setup-status` devuelve `configuredPublicUrl`.
- [ ] **Remoto (si aplica):** `https://<subdominio-cliente>.sistemaaserradero.com.ar` resuelve y carga el ERP con túnel nombrado activo; acceso solo por HTTPS.
- [ ] **CORS/origen:** la app permite el origen de la URL configurada y del túnel activo (sin errores de CORS en consola del navegador al usar la URL propia).
- [ ] **Licenciamiento sin regresión:** `LICENSE_SERVER_URL=https://auth.sistemaaserradero.com.ar` (Auth central) operativo según entorno; activación/verificación (`pull`), `SIGNING_KID`/PEM, binding `machine_id_hash`/`instance_id` y estados (`REVOKED/SUSPENDED/NOT_FOUND`) funcionan igual. La URL pública del ERP es independiente del Auth.
- [ ] **Seguridad:** sin exposición directa de puertos al router sin endurecimiento; acceso remoto por HTTPS; considerar Cloudflare Access/MFA o VPN para restringir acceso. No hay secretos/tokens commiteados.

## 5. Seguridad (recomendaciones)

- Publicar acceso remoto únicamente por **HTTPS** (túnel/proxy).
- Restringir acceso (Cloudflare Access, MFA, listas de acceso o VPN) para no exponer el ERP abiertamente a Internet.
- No exponer `APP_PORT`/DB directamente desde el router sin controles. La base de datos permanece aislada en la red interna del compose de producción.
- Mantener credenciales de túnel/Cloudflare fuera del repositorio, imágenes y paquetes distribuidos; almacenarlas solo en la PC/entorno del cliente según procedimiento seguro.

## 6. Relación con licenciamiento (Pilar 2)

- **No cambia** el contrato ni la configuración de licencias: `LICENSE_SERVER_URL`, JWKS/PEM/`SIGNING_KID`, verificación pull, intervalos/gracia, enforcement y binding por instalación.
- La URL pública del ERP es **información operativa** de acceso; no forma parte de claims ni de la activación de licencia. Cada instalación mantiene su propia identidad/licencia independiente de su subdominio.
