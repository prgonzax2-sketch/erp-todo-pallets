# Spec — Reportes: auto-preview, drill-down y reporte imprimible consolidado

**Slug:** `reportes-ux-detalle-impresion`  
**Fecha:** 2026-11-12  
**Estado:** Implementado (T1-T4)  
**Alcance:** `erp-todo-pallets` — `index.html` (Reportes). Sin cambios BE (D-B: fallback visual sin inventar registros).

## Contexto
Reportes (`#vista-reportes`, `GET /reportes/:modulo`) con preview manual y drill-down solo en Ventas (`/salidas-stock`). Módulos: produccion, ventas, gastos, rollos, fleteros, rrhh-partes, turnos, subproductos, pallets.

## Requerimientos y decisiones
### R1 — Auto-preview (D-A)
- Quitar botón `#rpt-btn-ver`.
- Auto-preview al entrar a vista Reportes y al modificar cualquier filtro (módulo, período, fecha, mes, año, desde, hasta, turno).
- Debounce ~300ms en inputs continuos; token de secuencia para descartar respuestas obsoletas. CSV y `rptBuildParams` preservados.

### R2 — Drill-down modal universal (D-B)
- Drill-down abre siempre `#modal-detalle-reporte` (paridad Ventas).
- Sin endpoint/fuente viable: fallback visual estático con contexto y totales/datos de fila, sin inventar registros y sin modificar backend. Render seguro. Ventas sin regresión.

### R3 — Impresión consolidada (D-C)
- Botón dedicado: reporte completo de 9 módulos vía `@media print` + `window.print()`.
- Fetch en lotes de 3 (`Promise.allSettled`), render diferido por módulo (RAF/setTimeout 0), progreso UI “Generando sección X de 9…”. Errores parciales tolerados.

## Matriz T1
| Módulo | meta.reporte | Fuente detalle | Filtros | Viabilidad bucket | Estrategia T3 |
|---|---|---|---|---|---|
| Ventas | ventas_remitos | GET /salidas-stock | fechaDesde,fechaHasta,aserradero | Alta | Rango + filtro bucket cliente (existente) |
| Gastos | gastos | GET /gastos | fechaDesde,fechaHasta,aserraderoId,page/limit | Media | Rango + filtro cliente; si no mapea → fallback |
| Rollos | rollos_ingresos | GET /ingreso-rollos | query (fecha/aserradero en entidad) | Media/Baja | Intento rango+cliente; si no fiable → fallback |
| CC Fleteros | cc_fleteros | GET /cuenta-corriente-fleteros/movimientos | desde,hasta,fleteroId | Media | Rango + filtro cliente; fallback si no mapeable |
| RRHH Partes | rrhh_partes_diarios | GET /partes-diarios | sin filtros query (scope) | Baja | **Fallback estático** (totales/contexto fila) |
| Turnos | turnos_planilla | GET /turnos/rango | desde,hasta | Media-Alta | Rango + filtro cliente; fallback si no mapeable |
| Subproductos | subproductos | GET /conciliacion/subproductos-egresos | aserradero,desde,hasta,tipo | Media-Alta | Rango + filtro cliente; fallback si no mapeable |
| Producción | produccion | GET /produccion/stock (sin detalle bucket claro) | query genérico | Baja | **Fallback estático** (totales/contexto) |
| Pallets | pallets_produccion | sin GET listado diario evidente | — | Baja | **Fallback estático** (totales/contexto) |

## Criterios
R1-R3 cumplidos, Ventas/CSV sin regresión, build OK, index.html UTF-8 sin BOM.
