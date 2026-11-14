# Spec — Turnkey setup, túnel remoto y primer admin

## Contexto
ERP on-prem por planta/cliente (instalador Windows + Docker). Cada instancia consume licenciamiento remoto del Auth central (`LICENSE_SERVER_URL`), con operación autónoma offline dentro de vigencia/gracia.

## Requerimientos
1. **Túnel gratuito automático (cloudflared Quick Tunnel):** sin cuenta ni apertura de puertos, URL pública HTTPS `https://*.trycloudflare.com` hacia `localhost:APP_PORT`. Arranque automático con Windows; URL activa persistida en archivo accesible al backend (`LICENSE_STATE_PATH/tunnel_url.txt`); CORS permite origen del túnel.
2. **Primera configuración (Setup Wizard):** disponible solo mientras no exista usuario admin activo. Mostrar URL pública del túnel (copiar) y URL local; formulario para crear Administrador General (email/usuario, contraseña) e iniciar sesión. Abrir automáticamente al finalizar instalador. Mostrar URL del túnel en vista de administración/configuración.
3. **Auth central intermitente:** ERP opera autónomo si `https://auth.sistemaaserradero.com.ar` no es alcanzable (estado previo, vigencia/gracia) y sincroniza por pull en próxima verificación exitosa.

## Decisiones de implementación
- Túnel en host Windows: `tools\cloudflared\cloudflared.exe` + helper `start-tunnel.ps1` + tarea `SistemaAserraderoERPTunnel` (ONLOGON). URL efímera, refrescada al reiniciar.
- Backend: endpoints públicos `/installation/setup-status`, `/installation/setup-admin` (controlado por ausencia de admin). CORS dinámico combina `CORS_ORIGINS` + origen túnel.
- Frontend: vista `#vista-setup` en SPA (`/setup`) y bloque de URL en Suscripción.
- "Nombre" de admin: aceptado en UI/API pero no persistido (modelo `Usuario` sin campo nombre). Usuario = email.