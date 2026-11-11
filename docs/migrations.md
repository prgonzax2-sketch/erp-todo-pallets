# Base de datos y migraciones (TypeORM + PostgreSQL)

## Estado actual (dev vs prod)
- **Dev/local (default):** `TYPEORM_SYNCHRONIZE=true` (`.env`/compose). TypeORM sincroniza entidades al esquema; los SQLs en `docs/sql-migrations/` son **idempotentes** y sirven como control/compatibilidad.
- **Staging/Producción:** usar **migraciones** (o SQLs controlados) y **`TYPEORM_SYNCHRONIZE=false`** (nunca `synchronize` en prod sin estrategia). Config en `src/app.module.ts`: `synchronize = TYPEORM_SYNCHRONIZE==='true'` o, por defecto, `NODE_ENV !== 'production'`.
- Scripts SQL idempotentes: `docs/sql-migrations/`.

## SQLs relevantes (conciliación v2 / base)
Ejecutables de forma idempotente (`IF NOT EXISTS`/`DROP DEFAULT` controlado). En dev con `synchronize` pueden coexistir; en entornos sin sync, aplicarlos en orden lógico antes/después según entidad:
- `2026-11-07-conteo-playa-rollos.sql` — tablas conteo/cierre playa.
- `2026-11-07-conciliacion-subproductos-egresos.sql` — egresos aserrín/chip (TN diferida).
- `2026-11-07-conciliacion-subproductos-egresos-drop-default.sql` — D1: quita default de `tnEstimadas` (históricos conservan valores).
- `2026-11-07-conciliacion-coef-config.sql` — config coeficientes por aserradero+grupo.
- `2026-11-08-conciliacion-subproductos-factor-tn.sql` — factores TN aserrín/chip opcionales (`factorTnAserrin/Chip`, nullable, sin default).
- `2026-11-08-subproducto-egreso-precio-tn.sql` — `precioPorTn` opcional/informativo en egresos subproductos (sin CC automática).
- `2026-11-08-pedido-items-subproducto.sql` — D-SP1/D-SP2 (F1): `pedido_items.tipoProducto` (default `MADERA`), `subproductoTipo` (ASERRIN/CHIP), `tnEstimada` (nullable); `espesor/ancho/largoSolicitado` pasan a nullable para ítems SUBPRODUCTO. Sin P2/kg inventado; SUBPRODUCTO no se asigna a stock de paquetes.
- Previos: `2026-11-07-f1-pedidos-reserva.sql` (agrega `produccion.cantidadReservada`; tablas `pedidos/*` por entidades — si `synchronize=false`, generar migración TypeORM o extender SQL al cerrar F1.2/F2), `2026-11-07-ingreso-rollos-fleteros-cc.sql`.

```bash
# Ejemplo (ajustar credenciales/host): aplicar un SQL idempotente
# docker compose exec -T db psql -U <user> -d <db> < docs/sql-migrations/<archivo>.sql
```

## Recomendación / runbook prod (pendiente formalizar)
1. **Antes de cambiar a prod:** respaldar DB (`pg_dump`/`./backups`), auditar entidades vs esquema real, probar en copia/staging.
2. **Config prod:** `NODE_ENV=production` y/o `TYPEORM_SYNCHRONIZE=false`. No habilitar `synchronize` en prod.
3. **Esquema:** adoptar migraciones TypeORM versionadas (`migration:generate/run/revert`) o aplicar los SQLs idempotentes de `docs/sql-migrations/` en ventana controlada. Mantener ambos alineados.
4. **Post-cambio:** smoke de endpoints críticos (`/conciliacion/*`, `/conteo-playa-rollos/*`, pedidos/producción), verificar que no hay `synchronize` activo en logs.

> Cambio de configuración/operación: hacerlo con respaldo y en ventana controlada. `m3UtilPorP2`/coef/factorTn/`produccion.m3` son calibrables (ver `GET/PUT/DELETE /conciliacion/config` o UI dashboard); no inventar valores operativos.
