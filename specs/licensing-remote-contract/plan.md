# Plan — Cumplimiento contrato remoto Auth↔ERP (Pilar 2)

**Fecha:** 2026-11-14  
**Basado en:** `specs/licensing-remote-contract/CONTRATO_Y_GAP.md`, evidencia `src/licensing/*`, `.env.example`, `deploy/docker-compose.prod.yml`, `deploy/windows-installer/*`, docs.

## Principios
- Cambios **mínimos y compatibles**: no romper enforcement ni semántica de estados (`ACTIVE/GRACE/EXPIRED/REVOKED/SUSPENDED/NOT_FOUND`), no introducir push/auto-bloqueo cliente, no exponer secretos/clave privada.
- **Remoto por defecto en distribución:** nunca asumir `localhost/127.0.0.1/host.docker.internal` en artefactos para clientes remotos; Auth inalcanzable ≠ revocado.

## Fases y cambios

### Fase 1 — Configuración y plantillas de distribución (G1, G2, G5, G7)
- **`.env.example`:** establecer `LICENSE_SERVER_URL` al valor de **producción remota** (HTTPS) provisto por Pilar 1 (o placeholder claramente marcado `https://<auth-remoto>` si no se entrega aún) con comentario explícito de no usar direcciones locales en clientes remotos; incluir nota de uso local-dev separado. Mantener `LICENSE_PUBLIC_KEY_PEM` (PEM SPKI, `\n` escapados) correspondiente al `kid` activo acordado.
- Documentar/recomendar `LICENSE_CHECK_INTERVAL_MS` para remotos (p.ej. 3600000 ms / 1h o valor acordado por SLA) manteniendo mínimo 60000 ms y default configurable; aclarar trade-off.
- Alinear `APP_VERSION` con tag de release (ej. `v1.0.0`) en `.env.example` y coherencia con `deploy/docker-compose.prod.yml` (`APP_VERSION`/`APP_IMAGE_TAG`).
- **Verificación:** diff de plantillas, revisión de valores oficiales.

### Fase 2 — Instalador/bootstrap (G3, G4 parcial, G6)
- **`deploy/windows-installer/bootstrap.ps1`:** al generar `.env` desde `.env.example`, si `LICENSE_SERVER_URL` está vacío o coincide con patrones locales (`localhost`, `127.0.0.1`, `host.docker.internal`) emitir **advertencia** en log y (si es posible sin romper modo oculto) mensaje claro indicando que instalaciones remotas requieren URL del Auth central; no forzar fallo para no romper dev controlado, pero dejar señal explícita. Mantener idempotencia y no sobreescribir `.env` existente.
- No embeder secretos; conservar parametrización vía `.env` empaquetado. (Opcional futuro: wizard de Inno Setup para URL/clave — fuera de mínimo si se documenta adecuadamente.)
- **`setup.iss`:** sin cambios funcionales mínimos salvo si se añade archivo de notas; asegurar empaquetado de `.env.example` correcto.
- **Verificación:** prueba de generación de `.env` en limpio, revisión de `bootstrap.log` ante URL local/vacía.

### Fase 3 — Validación y mensajes en ERP (G4)
- **`src/licensing/licensing.service.ts` (`verifyNow`):** clasificar errores de red/alcance (timeout/`AbortError` si aplica, `ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, TLS/cert) y registrar `lastError` accionable (ej. “No se pudo alcanzar el servidor de licencias (DNS/red/TLS). Verifique LICENSE_SERVER_URL y conectividad.”) **sin** cambiar comportamiento de preservación de estado previo ni confundir con estados revocado/suspendido. Mantener sanitización y no filtrar datos sensibles.
- (Opcional mínimo) validar formato básico de `LICENSE_SERVER_URL` (scheme http/https) al leer, con warning/log, sin bloquear.
- **UI/mensajes:** asegurar que `/activacion` y “Mi Suscripción” muestren el motivo de conectividad distinguiéndolo de bloqueo por estado efectivo.
- **Verificación:** pruebas unitarias/manuales simulando fallo de red vs estado revocado; build/tests focalizados.

### Fase 4 — Documentación y checklist operativo (G5, G6, G1-G2)
- **`docs/licenciamiento.md`:** sección “Operación remota (Auth central)”: URL HTTPS alcanzable provista por Pilar 1, PEM/kid correspondiente, prohibición de localhost/host.docker.internal en clientes remotos, obtención vía JWKS/canal seguro, comportamiento ante inalcanzable vs revocado, recomendación `LICENSE_CHECK_INTERVAL_MS` y trade-off, pasos de activación remota (HWID/instance → token → activar/check-now).
- **`docs/windows-packaging.md`:** prerequisitos remotos (Auth publicado HTTPS/DNS/firewall por Pilar 1, red saliente, imagen GHCR pública/tag, `LICENSE_SERVER_URL`/PEM configurados en artefacto o `.env`), aclarar que `host.docker.internal` es solo dev local.
- Referenciar `specs/licensing-remote-contract/CONTRATO_Y_GAP.md` y checklist de release.
- **Verificación:** revisión documental.

### Fase 5 — Validación E2E / criterios de aceptación
- Ejecutar escenarios de aceptación (ver `tasks.md` y sección de criterios en `CONTRATO_Y_GAP.md`/respuesta). Documentar evidencia.

## Riesgos y compatibilidad
- Cambio de valores por defecto en plantillas puede afectar flujos dev locales si no se documenta alternativa (`.env` local / override). Mitigar con comentarios claros.
- Mensajes nuevos no deben exponer detalles sensibles de infraestructura.
- No modificar guards/enforcement/estados.

## Dependencias externas
- Pilar 1: URL base pública estable + `LICENSE_PUBLIC_KEY_PEM` (`kid` vigente) + Auth desplegado accesible (HTTPS/TLS/firewall). Sin esto la verificación remota no es operable.