# Plan — Reportes: auto-preview, drill-down y reporte imprimible consolidado

**Decisiones:** D-A, D-B, D-C

## T2 (R1)
- Eliminar `#rpt-btn-ver`. `rptCargarPreview` con token secuencia (`_rptReqSeq`) para descartar obsoletas + debounce 300ms (`_rptDebounceTimer`).
- Listeners change/input en filtros y disparo al entrar a vista (`cambiarVista('reportes')`).

## T3 (R2)
- `rptAbrirDetalle` por `meta.reporte`: ventas `rptCargarDetalleBucket`; fuentes viables fetch rango+filtro cliente; baja viabilidad/sin endpoint (produccion, pallets_produccion, rrhh_partes_diarios) y no mapeables → fallback estático (contexto+totales fila, sin registros).
- `rptRenderPreview` hace filas clickeables para todos los módulos con detalle.

## T4 (R3)
- Botón `#rpt-btn-imprimir`, contenedor `#rpt-print-root`, progreso UI.
- `rptImprimirReporteCompleto`: fetch 9 módulos en lotes de 3 (`Promise.allSettled`), render diferido (RAF/setTimeout 0), progreso “Generando sección X de 9…”, `window.print()`, `@media print`.

## Verificación
`npm run build`, UTF-8 sin BOM, DevTools read-only si disponible.
