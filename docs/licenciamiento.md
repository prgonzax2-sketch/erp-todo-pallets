# Licenciamiento y actualizaciones on-prem — Cliente ERP (Pilar 2)

> Estado: cliente con verificación online (D2), **activación manual offline por pegado de token JWS** (Pilar 1 `issue-token`) y UI de bloqueo/renovación implementada en `index.html` + `src/licensing/*` (2026-11-12). **Sin claves privadas.** Piloto: `LICENSE_ENFORCEMENT=grace`, `UPDATES_AUTO_ENABLED=false`.  
> Contrato remoto Auth↔ERP: **aceptado** (Pilar 1, 2026-11-14). Ver `specs/licensing-remote-contract/CONTRATO_Y_GAP.md`.

## Identidad de instalación (D4)
- **`instance_id`**: UUID persistente en `${LICENSE_STATE_PATH:-./license}/instance.key` (ancla primaria).
- **`machine_id_hash` (Hardware ID / Machine ID)**: `sha256("instance:"+instanceId)`, derivado determinístico del `instance_id`. **Este es el código que debe coincidir byte a byte con `sub` del token de licencia y el que se registra en el servidor central.**
- La UI `/activacion` y “Mi Suscripción” muestran y permiten copiar **ambos** códigos etiquetados: `machine_id_hash` e `instance_id`.

## Operación remota (ERP lejos del Auth)
- **Modelo pull, sin push:** Auth es fuente de verdad. Suspender/revocar/restaurar se refleja en la **próxima verificación exitosa** del ERP (`verifyNow`: arranque ~5s, intervalo `LICENSE_CHECK_INTERVAL_MS`, `POST /licensing/check-now` admin, y flujos de activación/renovación). Si el ERP no alcanza al Auth, **no** puede enterarse hasta reconectar y verificar.
- **`Auth inalcanzable` ≠ `REVOKED/SUSPENDED/NOT_FOUND`:** ante fallos de red/DNS/timeout/TLS, el ERP registra el error (`lastError` accionable) y **conserva** el último estado verificado; opera según vigencia + gracia + anti-rollback. El bloqueo por revocación/suspensión/no-encontrado solo aplica cuando el estado efectivo persistido lo indica.
- **Propagación:** latencia máxima ≈ intervalo configurado (más tiempo offline). **Intervalo/SLA indicado:** `1800000` ms (30 min), mínimo 60000 ms. Usar `check-now` para casos urgentes.
- **Prerequisitos de despliegue (Pilar 1/infra):** Auth publicado y alcanzable desde los clientes (URL estable, preferentemente **HTTPS/TLS**, DNS, firewall/ruteo), con `POST /v1/license/verify` y `GET /.well-known/license-jwks.json` accesibles. Sin Auth local en instalaciones remotas.
- **Prerequisitos ERP:** `LICENSE_SERVER_URL` y `LICENSE_PUBLIC_KEY_PEM` correctos, red saliente al Auth, imagen/instalador configurados para el entorno.

## Activación por token (offline, pegado manual)
- El proveedor emite un JWS **RS256** (Pilar 1, p. ej. `POST /v1/admin/licenses/:id/issue-token`) firmado con la clave privada central. El ERP **solo** usa la clave pública pinneada (`LICENSE_PUBLIC_KEY_PEM`) para verificar firma.
- **Binding estricto:** `sub == machine_id_hash` e `instance_id == instance_id` (comparación exacta). Mismatch → activación rechazada con motivo claro (Hardware ID / instancia no coincide).
- **Claims/vigencia:** se validan claims contractuales (p. ej. `iss,sub,instance_id,license_status,plan,valid_from,valid_until,grace_hours,nbf,iat,jti,exp`, `server_time` si aplica). El acceso se rige por `valid_until` + `grace_hours` + `license_status` + reloj/anti-rollback/enforcement.
- **`exp` JWS corto vs vigencia contractual:** en **activación** se acepta defensivamente un `exp` JWS ya vencido solo si firma+binding son válidos y la vigencia contractual (`valid_until` + gracia, con skew) sigue vigente. En verificación online se exige `exp` válido. Siempre se requiere `valid_until` válido.
- **Estados no activos:** tokens firmados con estado `REVOKED`/`SUSPENDED`/expirado se aceptan criptográficamente pero el sistema queda **bloqueado** con motivo acorde; `NOT_FOUND`/sin licencia/vencida sin gracia bloquean según modo.
- **Sin red requerida** para activar: no se llama al central al pegar el token; la verificación online periódica (`verifyNow`) es independiente cuando `LICENSE_SERVER_URL` está configurado.

## UI y enforcement
- **Bloqueo obligatorio:** si no hay licencia, está vencida/bloqueada o hay mismatch/reloj alterado según política, el ERP fuerza `/activacion` y deshabilita la SPA operativa (`LicenseGuard` backend + guardia FE).
- **`/activacion` (pública):** muestra `machine_id_hash` e `instance_id` (copiables), motivo/estado/vigencia, textarea JWS y “Activar Sistema” (`POST /licensing/activate-token`).
- **“Mi Suscripción”:** Estado, Plan, Vencimiento, Días restantes, Fin de gracia, Última verificación, códigos y renovación (token) + `check-now`/estado según UI.
- **Endpoints públicos (sin JWT):** `GET /licensing/activation-status`, `POST /licensing/activate-token`.
- **Endpoints admin (JWT+roles):** `GET /licensing/status`, `POST /licensing/check-now`, `POST /licensing/activate`. `GET /health`, `/licensing*`, `/auth*` y estáticos whitelisted según `LicenseGuard`.

## Servidor de licencias y configuración

### `LICENSE_SERVER_URL` (oficial **pendiente de ingreso**)
- Debe ser la **URL base HTTPS** del Auth central alcanzable desde el ERP. **No usar `localhost`, `127.0.0.1` ni `host.docker.internal`** en instalaciones remotas/clientes en otras PCs.
- **Autorización A y B recibida** con valor de URL pendiente de provisión (`[INGRESA_AQUÍ_LA_URL_HTTPS_OFICIAL_DE_AUTH]`). `.env.example` mantiene temporalmente `http://host.docker.internal:3001` (**solo prueba local**) hasta recibir la URL oficial real; **reemplazar obligatoriamente antes de distribuir** a clientes remotos.
- `POST {LICENSE_SERVER_URL}/v1/license/verify` (y `/.well-known/license-jwks.json` en el Auth) deben ser accesibles. Paquete/plantilla: `specs/licensing-remote-contract/paquete-definitivo.template.env`.

### `LICENSE_PUBLIC_KEY_PEM` (confirmada, `kid=prod-20261111`)
Clave pública RSA **pinneada** (SPKI, RS256), correspondiente al firmante activo del Auth (Pilar 1). Debe coincidir con `/.well-known/license-jwks.json` (`kid` activo). **Sin exponer claves privadas.**  
*Rotación:* ERP usa pin estático; ante rotación de `kid` hay que actualizar la PEM en clientes dentro de la ventana de solapamiento (Auth soporta claves previas en JWKS).

```env
LICENSE_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlmRx+IzGkqXSXMTwLCvJ\nsBoAM8T4KZWfLpYZNU/8+Auf7Xt9f1KcsqxJgvlhT3VDi8UDWpVWcNvN0Jr1BdCL\nxh29UKZ1iqyHh7rnq/+yaX5G4QK33F2l2dxxXUImLV7gPRBdGmDcD/r1hraEln7e\ncuuZrdMxWmEinbxiAAJ5e7dCFW4dSoU0FNZHm0IMH+s34qw+NgpHLksC3sHmoMzr\n4JzwFrHAu3afBnD8L3mpM397OgIOM8RUdKVsv6DhGXHFGDkz5UqL9VGugMbslOrU\nKk6BVLykIt9RQdbSTEU5oMHRKPbJcQdACTW_vJTgJrbvRGNint7NmeMRb1A+cvMF\nUwIDAQAB\n-----END PUBLIC KEY-----"
```

## Configuración de piloto (obligatoria, F5)
- `LICENSE_ENFORCEMENT=grace` (no `strict`).
- `UPDATES_AUTO_ENABLED=false` (**no habilitar auto-update estricto**).
- `UPDATE_CHANNEL=stable`, `LICENSE_GRACE_HOURS`, `LICENSE_CLOCK_SKEW_SEC`.
- `LICENSE_CHECK_INTERVAL_MS`: **1800000 ms (30 min, SLA indicado)**. Mínimo 60000 ms. Ajustar solo si cambia el SLA acordado.

## Instalación (Windows, un solo clic)
- **Método soportado:** instalador `setup.exe` (Inno Setup). Empaqueta `deploy/docker-compose.prod.yml`, `.env.example` y `deploy/windows-installer/bootstrap.ps1`; crea `dbdata/`, `backups/`, `license/`, genera `.env` seguro si falta y levanta `docker compose -f docker-compose.prod.yml up -d`.
- `bootstrap.ps1` advierte si `LICENSE_SERVER_URL` está vacío o apunta a dirección local (no bloqueante). Para clientes remotos, configurar URL/PEM correctos en el `.env.example` del paquete (o en `.env` post-instalación) antes de operar.
- Guía: `docs/windows-packaging.md`.

## Hardening base (despliegue)
- **DB aislada:** `deploy/docker-compose.prod.yml` sin `ports` en `db`, red interna `internal`, `no-new-privileges`.
- **Volúmenes sensibles:** `./license` (identidad/estado D4) y `./backups` con permisos restringidos.
- **Headers:** `helmet` activo en `src/main.ts` (CSP deshabilitada por SPA inline).

## Referencias
- Contrato remoto/gap/plan: `specs/licensing-remote-contract/{CONTRATO_Y_GAP,plan,tasks}.md`
- SDD licenciamiento: `specs/licenciamiento-actualizaciones-onprem/{spec,plan,tasks}.md`
- Runbooks: `docs/runbooks/update-recovery.md`, `docs/migrations.md`
- Instalación/empaquetado: `docs/windows-packaging.md`, `deploy/windows-installer/{setup.iss,bootstrap.ps1}`, `deploy/docker-compose.prod.yml`
