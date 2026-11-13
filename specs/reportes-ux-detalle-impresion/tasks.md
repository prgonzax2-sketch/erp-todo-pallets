# Tasks — Reportes: auto-preview, drill-down y reporte imprimible consolidado

## Checklist
- [x] **T0** SDD creado (D-A/D-B/D-C).
- [x] **T1** Mapeo endpoints/fuentes (matriz en spec).
- [x] **T2** R1: sin `#rpt-btn-ver`, auto-preview entrada/cambio filtros, debounce 300ms, token secuencia.
- [x] **T3** R2: modal universal + fallback estático (Producción, Pallets, RRHH y no mapeables) sin inventar/sin BE.
- [x] **T4** R3: imprimir consolidado 9 módulos, lotes de 3, Promise.allSettled, render diferido, progreso UI, @media print.
- [x] **T5** BE: no requerido.
- [ ] **T6** Accesibilidad/responsive (validar 390×844 si disponible).
- [x] **T7** Build + commits atómicos (sin push).

## T1
Baja viabilidad/fallback forzado: `produccion`, `pallets_produccion`, `rrhh_partes_diarios`.

## Registro
- Cambios: `index.html`, `specs/reportes-ux-detalle-impresion/*`.
- Verificación: `npm run build`; UTF-8 sin BOM confirmado.
