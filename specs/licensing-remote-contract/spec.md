# Spec — Contrato remoto Auth↔ERP (Licenciamiento on-prem)

**Fecha:** 2026-11-14 (actualizado con aceptación Pilar 1)  
**Estado:** Contrato aceptado por Pilar 1 (pendiente URL oficial/SLA/E2E e implementación ERP de gaps)  
**Contexto:** `erp-todo-pallets` (Pilar 2, cliente/licencia) debe operar en instalaciones remotas (otra PC/red) sin Auth local ni co-localización con `sistema-aserradero-auth` (Pilar 1). La revocación/suspensión se propaga en la **próxima verificación exitosa** (pull), no por push. `kid`/PEM `prod-20261111` confirmados por Pilar 1; URL pública oficial y SLA definitivo pendientes.

## Objetivo
Definir un contrato explícito Auth↔ERP para operación remota, identificar brechas de implementación/instalador actuales y planificar cambios mínimos compatibles (sin romper enforcement ni semántica de estados).

## Alcance
- Configuración remota (`LICENSE_SERVER_URL`, `LICENSE_PUBLIC_KEY_PEM`, parámetros relacionados).
- Flujos: activación/verificación online remota, degradado/offline, reflejo de `REVOKED/SUSPENDED`.
- Frecuencia de verificación y trade-offs.
- Instalador Windows en PC limpia: parametrización y prerequisitos.
- Documentación/validaciones/mensajes.

## Fuera de alcance
- Cambios en semántica de estados/enforcement o exposición de claves privadas.
- Mecanismos push/token de auto-bloqueo entregado al cliente.
- Implementación de despliegue/TLS/firewall del Auth (responsabilidad Pilar 1/infra), salvo documentación de requisitos.

## Entregables
- Contrato propuesto (Pilar 1 / Pilar 2) — `CONTRATO_Y_GAP.md`
- Gap analysis actual vs contrato — `CONTRATO_Y_GAP.md`
- Plan de cambios mínimos + criterios de aceptación — `plan.md`, `tasks.md`
- Preguntas/bloqueos para Pilar 1 — `CONTRATO_Y_GAP.md` / respuesta

## Referencias
- Pilar 1 (fuente de verdad provista): `POST /v1/license/verify`, `GET /.well-known/license-jwks.json`, binding `sub==machine.machineIdHash` e `instance_id==instanceId`, RS256/JWS, estados/claims, `issue-token` admin, pull en `verifyNow` (arranque ~5s, intervalo `LICENSE_CHECK_INTERVAL_MS` min 60000ms default ~24h, `POST /licensing/check-now`).
- Pilar 2 (evidencia): `src/licensing/*`, `.env.example`, `deploy/docker-compose.prod.yml`, `deploy/windows-installer/*`, `docs/licenciamiento.md`, `docs/windows-packaging.md`.