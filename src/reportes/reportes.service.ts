import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { calcP2, calcP2Component, normalizarEspecie, mergeCoef, getCoef, round3 as cRound3, type GrupoEspecie } from '../conciliacion/conciliacion.utils.js';
import { ReportesQueryDto } from './dto/reportes-query.dto.js';
import {
  calcularRangoReporte,
  normalizarFechaRef,
  num,
  resolveScopeAserradero,
  round2,
  round3,
  toCsv,
  validarAdmin,
} from './reportes.utils.js';

@Injectable()
export class ReportesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private rango(query: ReportesQueryDto) {
    if (query.desde && query.hasta) {
      const desde = normalizarFechaRef(query.desde);
      const hasta = normalizarFechaRef(query.hasta);
      const per = query.periodo || 'day';
      return { periodo: per, fechaRef: desde, desde, hasta, label: `${desde} a ${hasta}` };
    }
    return calcularRangoReporte(query.periodo, query.fecha);
  }

  private meta(reporte: string, query: ReportesQueryDto, user: AuthenticatedUser, rango: any, scope: string | null, extra?: any) {
    return {
      reporte,
      generadoEn: new Date().toISOString(),
      periodo: rango.periodo,
      fechaRef: rango.fechaRef,
      desde: rango.desde,
      hasta: rango.hasta,
      label: rango.label,
      scopeAserradero: scope,
      rol: user?.rol,
      estimados: extra?.estimados ?? null,
      ...extra,
    };
  }

  // ---------- PRODUCCIÓN (on-the-fly, P² canónica en servicio) ----------
  async produccion(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const params: any[] = [rango.desde, rango.hasta];
    let where = `WHERE NULLIF("fecha",'')::date BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); where += ` AND "aserradero" = $${params.length}`; }
    const rows: any[] = await this.dataSource.query(
      `SELECT id, "fecha", "aserradero", "especie", "tipoProducto", "cantidadPaquetes", "cantidadReservada", "piezasPorPaquete",
              "espesor", "ancho", "largo", "unidadDimensiones", "separadores", "tacos"
         FROM produccion ${where}
         ORDER BY "fecha" ASC, id ASC`,
      params,
    );
    const groups = new Map<string, any>();
    let tot = { registros: 0, paquetes_fisicos: 0, paquetes_reservados: 0, paquetes_disponibles: 0, piezas_disponibles: 0, p2_estimado: 0 };
    for (const r of rows) {
      const aserradero = String(r.aserradero || 'Sin asignar');
      if (!groups.has(aserradero)) groups.set(aserradero, { aserradero, registros: 0, paquetes_fisicos: 0, paquetes_reservados: 0, paquetes_disponibles: 0, piezas_disponibles: 0, p2_estimado: 0 });
      const b = groups.get(aserradero);
      const fis = num(r.cantidadPaquetes); const res = num(r.cantidadReservada); const disp = Math.max(0, fis - res);
      const piezas = disp * num(r.piezasPorPaquete);
      let p2 = calcP2(fis, num(r.piezasPorPaquete), num(r.espesor), num(r.ancho), num(r.largo), r.unidadDimensiones);
      const comps = [...(Array.isArray(r.separadores) ? r.separadores : []), ...(Array.isArray(r.tacos) ? r.tacos : [])];
      for (const c of comps) p2 += calcP2Component(fis, c, r.unidadDimensiones);
      b.registros += 1; b.paquetes_fisicos += fis; b.paquetes_reservados += res; b.paquetes_disponibles += disp; b.piezas_disponibles += piezas; b.p2_estimado += p2;
      tot.registros += 1; tot.paquetes_fisicos += fis; tot.paquetes_reservados += res; tot.paquetes_disponibles += disp; tot.piezas_disponibles += piezas; tot.p2_estimado += p2;
    }
    const detalle = Array.from(groups.values()).map(b => ({ ...b, paquetes_fisicos: round3(b.paquetes_fisicos), paquetes_reservados: round3(b.paquetes_reservados), paquetes_disponibles: round3(b.paquetes_disponibles), piezas_disponibles: round2(b.piezas_disponibles), p2_estimado: round3(b.p2_estimado) }))
      .sort((a,b)=> String(a.aserradero).localeCompare(String(b.aserradero)));
    tot = { registros: tot.registros, paquetes_fisicos: round3(tot.paquetes_fisicos), paquetes_reservados: round3(tot.paquetes_reservados), paquetes_disponibles: round3(tot.paquetes_disponibles), piezas_disponibles: round2(tot.piezas_disponibles), p2_estimado: round3(tot.p2_estimado) };
    return { meta: this.meta('produccion', query, user, rango, scope, { estimados: 'p2_estimado calculado (mm/424e9, incluye separadores/tacos); m3/TN no incluidos en este bloque (ver conciliación).' }), totales: tot, detalle };
  }
  produccionCsv(data: any) { const h=['aserradero','registros','paquetes_fisicos','paquetes_reservados','paquetes_disponibles','piezas_disponibles','p2_estimado']; return toCsv(h, (data.detalle||[]).map((r:any)=>h.map(k=>r[k]))); }

  // ---------- VENTAS / REMITOS ----------
  async ventas(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const incluirAnulados = String(query.incluirAnulados || '').toLowerCase() === 'true';
    const params: any[] = [rango.desde, rango.hasta];
    let where = `WHERE v.fecha_d BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); where += ` AND v.aserradero = $${params.length}`; }
    if (!incluirAnulados) where += ` AND v.es_anulada = false`;
    const rows: any[] = await this.dataSource.query(
      `SELECT COALESCE(v.aserradero,'Sin asignar') AS aserradero,
              COUNT(*)::int AS remitos,
              SUM(CASE WHEN v.es_anulada THEN 1 ELSE 0 END)::int AS anulados,
              SUM(CASE WHEN COALESCE(v.estado_despacho,'')='PENDIENTE_BASCULA' THEN 1 ELSE 0 END)::int AS pendientes_bascula,
              ROUND(SUM(v.subtotal_neto)::numeric,2) AS subtotal_neto,
              ROUND(SUM(v.iva_monto)::numeric,2) AS iva_monto,
              ROUND(SUM(v.total)::numeric,2) AS total,
              ROUND(SUM(v.total_p2_despachado)::numeric,3) AS p2_despachado,
              ROUND(SUM(v.toneladas_total)::numeric,3) AS tn_total,
              ROUND(SUM(v.m2_total)::numeric,3) AS m2_total,
              ROUND(SUM(v.total_paquetes)::numeric,3) AS paquetes,
              ROUND(SUM(v.total_piezas)::numeric,3) AS piezas
         FROM vw_rpt_ventas_remitos v
         ${where}
         GROUP BY 1 ORDER BY 1`,
      params,
    );
    const tot = rows.reduce((a,r)=>{ for(const k of ['remitos','anulados','pendientes_bascula']) a[k]+=num(r[k]); for(const k of ['subtotal_neto','iva_monto','total']) a[k]=round2(a[k]+num(r[k])); for(const k of ['p2_despachado','tn_total','m2_total','paquetes','piezas']) a[k]=round3(a[k]+num(r[k])); return a; }, {remitos:0,anulados:0,pendientes_bascula:0,subtotal_neto:0,iva_monto:0,total:0,p2_despachado:0,tn_total:0,m2_total:0,paquetes:0,piezas:0});
    const detalle = rows.map(r=>({ ...r, subtotal_neto:round2(r.subtotal_neto), iva_monto:round2(r.iva_monto), total:round2(r.total), p2_despachado:round3(r.p2_despachado), tn_total:round3(r.tn_total), m2_total:round3(r.m2_total), paquetes:round3(r.paquetes), piezas:round3(r.piezas) }));
    return { meta: this.meta('ventas_remitos', query, user, rango, scope, { incluirAnulados, nota: 'Por defecto excluye anulados (estado/estadoDespacho ANULADO). Métricas desde cabecera salidas_stock (en vivo). Agregado por aserradero en el rango.' }), totales: tot, detalle };
  }
  ventasCsv(data: any) { const h=['aserradero','remitos','anulados','pendientes_bascula','subtotal_neto','iva_monto','total','p2_despachado','tn_total','m2_total','paquetes','piezas']; return toCsv(h, (data.detalle||[]).map((r:any)=>h.map(k=>r[k]))); }

  // ---------- PEDIDOS ----------
  async pedidos(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const params: any[] = [rango.desde, rango.hasta];
    let where = `WHERE v.fecha_d BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); where += ` AND v.aserradero = $${params.length}`; }
    if (query.estado) { params.push(String(query.estado)); where += ` AND v.estado = $${params.length}`; }
    const rows: any[] = await this.dataSource.query(
      `SELECT COALESCE(v.aserradero,'Sin asignar') AS aserradero, COALESCE(v.estado,'') AS estado,
              COUNT(*)::int AS pedidos,
              ROUND(SUM(v.cantidad_solicitada_total)::numeric,3) AS cantidad_solicitada,
              ROUND(SUM(v.total_p2_solicitado)::numeric,3) AS p2_solicitado
         FROM vw_rpt_pedidos v
         ${where}
         GROUP BY 1,2 ORDER BY 1,2`, params);
    const tot = rows.reduce((a,r)=>{ a.pedidos+=num(r.pedidos); a.cantidad_solicitada=round3(a.cantidad_solicitada+num(r.cantidad_solicitada)); a.p2_solicitado=round3(a.p2_solicitado+num(r.p2_solicitado)); return a; }, {pedidos:0,cantidad_solicitada:0,p2_solicitado:0});
    return { meta: this.meta('pedidos', query, user, rango, scope), totales: tot, detalle: rows.map(r=>({ ...r, cantidad_solicitada:round3(r.cantidad_solicitada), p2_solicitado:round3(r.p2_solicitado) })) };
  }
  pedidosCsv(data:any){ const h=['aserradero','estado','pedidos','cantidad_solicitada','p2_solicitado']; return toCsv(h,(data.detalle||[]).map((r:any)=>h.map(k=>r[k]))); }

  // ---------- GASTOS (efectivos = CONFIRMADO por defecto) ----------
  async gastos(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const estado = query.estado ? String(query.estado).toUpperCase() : 'CONFIRMADO';
    const params: any[] = [rango.desde, rango.hasta, estado];
    let where = `WHERE v.fecha_d BETWEEN $1::date AND $2::date AND v.estado = $3`;
    if (scope) { params.push(scope); where += ` AND (v.aserradero_nombre = $${params.length})`; }
    const rows: any[] = await this.dataSource.query(
      `SELECT COALESCE(v.aserradero_nombre,'Sin asignar') AS aserradero, COALESCE(v.area_nombre,'') AS area,
              COUNT(*)::int AS comprobantes,
              ROUND(SUM(v.subtotal_neto)::numeric,2) AS subtotal_neto,
              ROUND(SUM(v.iva_monto)::numeric,2) AS iva_monto,
              ROUND(SUM(v.otros_tributos)::numeric,2) AS otros_tributos,
              ROUND(SUM(v.total)::numeric,2) AS total
         FROM vw_rpt_gastos_todos v
         ${where}
         GROUP BY 1,2 ORDER BY 1,2`, params);
    const tot = rows.reduce((a,r)=>{ a.comprobantes+=num(r.comprobantes); for(const k of ['subtotal_neto','iva_monto','otros_tributos','total']) a[k]=round2(a[k]+num(r[k])); return a; }, {comprobantes:0,subtotal_neto:0,iva_monto:0,otros_tributos:0,total:0});
    return { meta: this.meta('gastos', query, user, rango, scope, { estado, nota: 'Default CONFIRMADO (efectivo, alineado a dashboard). Use ?estado=BORRADOR|ANULADO para otros cortes.' }), totales: tot, detalle: rows.map(r=>({ ...r, subtotal_neto:round2(r.subtotal_neto), iva_monto:round2(r.iva_monto), otros_tributos:round2(r.otros_tributos), total:round2(r.total) })) };
  }
  gastosCsv(data:any){ const h=['aserradero','area','comprobantes','subtotal_neto','iva_monto','otros_tributos','total']; return toCsv(h,(data.detalle||[]).map((r:any)=>h.map(k=>r[k]))); }

  // ---------- ROLLOS (ingresos) ----------
  async rollos(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const params: any[] = [rango.desde, rango.hasta];
    let where = `WHERE v.fecha_d BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); where += ` AND v.aserradero = $${params.length}`; }
    const rows: any[] = await this.dataSource.query(
      `SELECT COALESCE(v.aserradero,'Sin asignar') AS aserradero,
              COUNT(*)::int AS ingresos,
              ROUND(SUM(v.toneladas)::numeric,3) AS toneladas,
              ROUND(SUM(v.m3)::numeric,3) AS m3,
              ROUND(SUM(v.total_madera)::numeric,2) AS total_madera,
              ROUND(SUM(v.total_flete)::numeric,2) AS total_flete,
              ROUND((SUM(v.total_madera)+SUM(v.total_flete))::numeric,2) AS total_general
         FROM vw_rpt_ingresos_rollos v
         ${where}
         GROUP BY 1 ORDER BY 1`, params);
    const tot = rows.reduce((a,r)=>{ a.ingresos+=num(r.ingresos); for(const k of ['toneladas','m3']) a[k]=round3(a[k]+num(r[k])); for(const k of ['total_madera','total_flete','total_general']) a[k]=round2(a[k]+num(r[k])); return a; }, {ingresos:0,toneladas:0,m3:0,total_madera:0,total_flete:0,total_general:0});
    const detalle = rows.map(r=>({ ...r, toneladas:round3(r.toneladas), m3:round3(r.m3), total_madera:round2(r.total_madera), total_flete:round2(r.total_flete), total_general:round2(r.total_general) }));
    return { meta: this.meta('rollos_ingresos', query, user, rango, scope, { nota: 'Ingresos rollos (TN, m3, costo madera, costo flete) agregado por aserradero en el rango.' }), totales: tot, detalle };
  }
  rollosCsv(data:any){ const h=['aserradero','ingresos','toneladas','m3','total_madera','total_flete','total_general']; return toCsv(h,(data.detalle||[]).map((r:any)=>h.map(k=>r[k]))); }

  // ---------- CC FLETEROS ----------
  async fleteros(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const params: any[] = [rango.desde, rango.hasta];
    let where = `WHERE v.fecha_d BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); where += ` AND v.aserradero = $${params.length}`; }
    const rows: any[] = await this.dataSource.query(
      `SELECT COALESCE(v.aserradero,'Sin asignar') AS aserradero,
              COALESCE(v.fletero_nombre,'Sin fletero') AS fletero,
              v."fleteroId" AS fletero_id,
              COALESCE(v.tipo,'') AS tipo,
              COUNT(*)::int AS movimientos,
              ROUND(SUM(v.devengado)::numeric,2) AS devengado,
              ROUND(SUM(v.pagos_adelantos)::numeric,2) AS pagos_adelantos,
              ROUND(SUM(v.impacto_saldo)::numeric,2) AS impacto_saldo
         FROM vw_rpt_cc_fleteros v
         ${where}
         GROUP BY 1,2,3,4 ORDER BY 1,2,4`, params);
    const tot = rows.reduce((a,r)=>{ a.movimientos+=num(r.movimientos); for(const k of ['devengado','pagos_adelantos','impacto_saldo']) a[k]=round2(a[k]+num(r[k])); return a; }, {movimientos:0,devengado:0,pagos_adelantos:0,impacto_saldo:0});
    const detalle = rows.map(r=>({ ...r, devengado:round2(r.devengado), pagos_adelantos:round2(r.pagos_adelantos), impacto_saldo:round2(r.impacto_saldo) }));
    return { meta: this.meta('cc_fleteros', query, user, rango, scope, { nota: 'Movimientos CC fleteros agrupados por aserradero/fletero/tipo en el rango.' }), totales: tot, detalle };
  }
  fleterosCsv(data:any){ const h=['aserradero','fletero','fletero_id','tipo','movimientos','devengado','pagos_adelantos','impacto_saldo']; return toCsv(h,(data.detalle||[]).map((r:any)=>h.map(k=>r[k]))); }

  // ---------- RRHH PARTES DIARIOS ----------
  async rrhhPartes(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const params: any[] = [rango.desde, rango.hasta];
    let where = `WHERE v.fecha_d BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); where += ` AND v.aserradero = $${params.length}`; }
    const rows: any[] = await this.dataSource.query(
      `SELECT COALESCE(v.aserradero,'Sin asignar') AS aserradero,
              v."empleadoId" AS empleado_id,
              COALESCE(v.empleado_nombre,'') AS empleado,
              COUNT(*)::int AS partes,
              ROUND(SUM(v.horas_trabajadas)::numeric,2) AS horas_trabajadas,
              ROUND(SUM(v.monto_extra)::numeric,2) AS monto_extra,
              SUM(v.pallets_fabricados)::int AS pallets_fabricados,
              SUM(v.camiones_cargados)::int AS camiones_cargados,
              SUM(v.turnos_limpieza)::int AS turnos_limpieza,
              SUM(CASE WHEN v.liquidado THEN 1 ELSE 0 END)::int AS liquidados
         FROM vw_rpt_partes_diarios v
         ${where}
         GROUP BY 1,2,3 ORDER BY 1,3`, params);
    const tot = rows.reduce((a,r)=>{ a.partes+=num(r.partes); a.horas_trabajadas=round2(a.horas_trabajadas+num(r.horas_trabajadas)); a.monto_extra=round2(a.monto_extra+num(r.monto_extra)); for(const k of ['pallets_fabricados','camiones_cargados','turnos_limpieza','liquidados']) a[k]+=num(r[k]); return a; }, {partes:0,horas_trabajadas:0,monto_extra:0,pallets_fabricados:0,camiones_cargados:0,turnos_limpieza:0,liquidados:0});
    const detalle = rows.map(r=>({ ...r, horas_trabajadas:round2(r.horas_trabajadas), monto_extra:round2(r.monto_extra) }));
    return { meta: this.meta('rrhh_partes_diarios', query, user, rango, scope, { nota: 'Partes diarios agregados por empleado/aserradero en el rango.' }), totales: tot, detalle };
  }
  rrhhPartesCsv(data:any){ const h=['aserradero','empleado_id','empleado','partes','horas_trabajadas','monto_extra','pallets_fabricados','camiones_cargados','turnos_limpieza','liquidados']; return toCsv(h,(data.detalle||[]).map((r:any)=>h.map(k=>r[k]))); }

  // ---------- EMPLEADOS (resumen planilla por empleado en rango: horas, extras/tareas, pagos y adelantos) ----------
  async empleados(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const params: any[] = [rango.desde, rango.hasta];
    let where = `WHERE t."fecha"::date BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); where += ` AND COALESCE(t."aserradero", e."aserradero", 'Sin asignar') = $${params.length}`; }

    const rows: any[] = await this.dataSource.query(
      `SELECT COALESCE(t."aserradero", e."aserradero", 'Sin asignar') AS aserradero,
              t."empleadoId" AS empleado_id,
              COALESCE(e."nombreCompleto", '') AS empleado,
              COUNT(*)::int AS registros,
              COUNT(DISTINCT t."fecha")::int AS dias_trabajados,
              ROUND(SUM(COALESCE(t."hs",0))::numeric,2) AS hs_trabajadas,
              ROUND(SUM(COALESCE(t."pal",0))::numeric,2) AS pallets,
              ROUND(SUM(COALESCE(t."lim",0))::numeric,2) AS limpiezas,
              ROUND(SUM(COALESCE(t."des",0))::numeric,2) AS descargas,
              ROUND(SUM(COALESCE(t."car",0))::numeric,2) AS cargas,
              ROUND(SUM(COALESCE(t."hs",0) * COALESCE(t."precio",0))::numeric,2) AS monto_horas,
              ROUND(SUM(COALESCE(t."hs",0) * COALESCE(t."pres",0))::numeric,2) AS monto_presentismo
         FROM turnos_borradores t
         LEFT JOIN empleados e ON e."id" = t."empleadoId"
         ${where}
         GROUP BY 1,2,3
         ORDER BY 1,3`, params);

    // Adelantos entregados en el período por empleado (misma lógica de rango por fecha)
    const advParams: any[] = [rango.desde, rango.hasta];
    let advWhere = `WHERE a."fecha"::date BETWEEN $1::date AND $2::date`;
    if (scope) { advParams.push(scope); advWhere += ` AND COALESCE(e2."aserradero", 'Sin asignar') = $${advParams.length}`; }
    let adelantos: any[] = [];
    try {
      adelantos = await this.dataSource.query(
        `SELECT a."empleadoId" AS empleado_id,
                ROUND(SUM(COALESCE(a."montoEntregado",0))::numeric,2) AS adelantos_periodo,
                COUNT(*)::int AS adelantos_cantidad
           FROM adelantos a
           LEFT JOIN empleados e2 ON e2."id" = a."empleadoId"
           ${advWhere}
           GROUP BY 1`, advParams);
    } catch { adelantos = []; }
    const advMap = new Map<string, { adelantos_periodo: number; adelantos_cantidad: number }>();
    for (const a of adelantos) advMap.set(String(a.empleado_id), { adelantos_periodo: round2(a.adelantos_periodo), adelantos_cantidad: num(a.adelantos_cantidad) });

    const detalle = rows.map(r => {
      const monto_horas = round2(r.monto_horas);
      const monto_presentismo = round2(r.monto_presentismo);
      const subtotal_planilla = round2(monto_horas + monto_presentismo);
      const adv = advMap.get(String(r.empleado_id)) || { adelantos_periodo: 0, adelantos_cantidad: 0 };
      const neto_estimado = round2(subtotal_planilla - num(adv.adelantos_periodo));
      return {
        aserradero: r.aserradero,
        empleado_id: r.empleado_id,
        empleado: r.empleado,
        registros: num(r.registros),
        dias_trabajados: num(r.dias_trabajados),
        hs_trabajadas: round2(r.hs_trabajadas),
        monto_horas,
        monto_presentismo,
        pallets: round2(r.pallets),
        limpiezas: round2(r.limpiezas),
        descargas: round2(r.descargas),
        cargas: round2(r.cargas),
        subtotal_planilla,
        adelantos_periodo: round2(adv.adelantos_periodo),
        neto_estimado,
      };
    });

    const totKeys = ['registros','dias_trabajados','hs_trabajadas','monto_horas','monto_presentismo','pallets','limpiezas','descargas','cargas','subtotal_planilla','adelantos_periodo','neto_estimado'] as const;
    const tot: any = {};
    for (const k of totKeys) tot[k] = 0;
    for (const r of detalle) for (const k of totKeys) tot[k] = (k === 'registros' || k === 'dias_trabajados') ? (tot[k] + num((r as any)[k])) : round2(tot[k] + num((r as any)[k]));

    return {
      meta: this.meta('empleados', query, user, rango, scope, {
        nota: 'Resumen de planilla por empleado (turnos_borradores): monto_horas = Σ(hs*precio/hora), monto_presentismo = Σ(pres, monto de presentismo registrado por fila), y registros de tareas (pallets, limpiezas, descargas, cargas) tal como se guardan en planilla. Subtotal planilla = monto_horas + monto_presentismo. Adelantos = monto entregado en el período. Neto estimado = subtotal planilla - adelantos. No incluye pagos por tareas/extras calculados con tarifas globales de la UI (pallet/limpieza/carga/descarga/bonos) porque esas tarifas no están persistidas en BD; por eso puede diferir del "Total Generado" de la pantalla Planilla.',
      }),
      totales: tot,
      detalle,
    };
  }
  empleadosCsv(data:any){ const h=['aserradero','empleado_id','empleado','registros','dias_trabajados','hs_trabajadas','monto_horas','monto_presentismo','pallets','limpiezas','descargas','cargas','subtotal_planilla','adelantos_periodo','neto_estimado']; return toCsv(h,(data.detalle||[]).map((r:any)=>h.map(k=>r[k]))); }

  // ---------- SUBPRODUCTOS (cruce generación teórica TN vs egresos efectivos, D1/sin inventar) ----------
  private async loadCoefOverrides(aserradero: string): Promise<Record<string, any>> {
    try {
      const rows: any[] = await this.dataSource.query(`SELECT * FROM conciliacion_coef_config WHERE "aserradero" = $1 AND "activo" = true`, [aserradero]);
      const out: Record<string, any> = {};
      for (const r of rows || []) {
        const o: any = {};
        for (const k of ['rendimientoMadera','coefAserrin','coefChip','factorTnConsumo','m3UtilPorP2']) if (r[k] != null) o[k] = Number(r[k]);
        for (const k of ['factorTnAserrin','factorTnChip']) { const v = r[k]; if (Number.isFinite(Number(v)) && Number(v) > 0) o[k] = Number(v); }
        out[String(r.grupoEspecie || '').toUpperCase()] = o;
      }
      return out;
    } catch { return {}; }
  }
  private tnTeoricaSubprodPorTipo(p2: number, grupo: GrupoEspecie, overrides: Record<string, any>, tipo: 'ASERRIN'|'CHIP'): number | null {
    const c = mergeCoef(getCoef(grupo), overrides?.[grupo]).coef;
    const m3Util = p2 * (Number(c.m3UtilPorP2) || 0);
    const rend = Number(c.rendimientoMadera) > 0 ? Number(c.rendimientoMadera) : 0.5;
    const m3Rollo = rend > 0 ? m3Util / rend : 0;
    if (tipo === 'ASERRIN') {
      const aM3 = m3Rollo * (Number(c.coefAserrin) || 0);
      const f = Number(c.factorTnAserrin); if (!(Number.isFinite(f) && f > 0) || aM3 <= 0.0005) return aM3 <= 0.0005 ? 0 : null;
      return cRound3(aM3 * f);
    } else {
      const chM3 = m3Rollo * (Number(c.coefChip) || 0);
      const f = Number(c.factorTnChip); if (!(Number.isFinite(f) && f > 0) || chM3 <= 0.0005) return chM3 <= 0.0005 ? 0 : null;
      return cRound3(chM3 * f);
    }
  }
  async subproductos(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const params: any[] = [rango.desde, rango.hasta];
    let whereE = `WHERE v.fecha_d BETWEEN $1::date AND $2::date`;
    let whereP = `WHERE NULLIF("fecha",'')::date BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); whereE += ` AND v.aserradero = $${params.length}`; whereP += ` AND "aserradero" = $${params.length}`; }
    const egRaw: any[] = await this.dataSource.query(
      `SELECT COALESCE(v.aserradero,'Sin asignar') AS aserradero, COALESCE(v.tipo,'') AS tipo, COALESCE(v.especie_declarada,'OTRO') AS especie_raw,
              ROUND(SUM(v.tn_efectiva)::numeric,3) AS tn_egreso_efectiva, ROUND(SUM(v.tn_estimadas)::numeric,3) AS tn_egreso_estimadas,
              SUM(CASE WHEN v.tn_reales IS NULL THEN 1 ELSE 0 END)::int AS egresos_pendientes_confirmar, COUNT(*)::int AS egresos
         FROM vw_rpt_subproductos v
         ${whereE} GROUP BY 1,2,3`, params);
    const egRows = egRaw.map((r: any) => ({ ...r, especie: normalizarEspecie(r.especie_raw) }));
    const prodRows: any[] = await this.dataSource.query(
      `SELECT "fecha","aserradero","especie","cantidadPaquetes","piezasPorPaquete","espesor","ancho","largo","unidadDimensiones","separadores","tacos" FROM produccion ${whereP}`, params);
    const p2map = new Map<string, number>();
    for (const r of prodRows) {
      const as = String(r.aserradero||'Sin asignar');
      const fis = num(r.cantidadPaquetes); const u = r.unidadDimensiones;
      const add = (grupo: string, p2v: number) => { const k = `${as}||${grupo}`; p2map.set(k, (p2map.get(k)||0)+p2v); };
      add(normalizarEspecie(r.especie), calcP2(fis, num(r.piezasPorPaquete), num(r.espesor), num(r.ancho), num(r.largo), u));
      for (const c of [...(Array.isArray(r.separadores)?r.separadores:[]), ...(Array.isArray(r.tacos)?r.tacos:[])]) add(normalizarEspecie(c?.especie||r.especie), calcP2Component(fis, c, u));
    }
    const coefCache = new Map<string, Record<string,any>>();
    const genRows: any[] = [];
    for (const [k,p2] of p2map.entries()) {
      const [as, grupo] = k.split('||');
      if (!coefCache.has(as)) coefCache.set(as, await this.loadCoefOverrides(as === 'Sin asignar' ? '' : as));
      const ov = coefCache.get(as) || {};
      for (const tipo of ['ASERRIN','CHIP'] as const) {
        const tnGen = this.tnTeoricaSubprodPorTipo(p2, grupo as GrupoEspecie, ov, tipo);
        genRows.push({ aserradero: as, tipo, especie: grupo, tn_generacion_teorica: tnGen == null ? null : round3(tnGen), p2_base: round3(p2) });
      }
    }
    const keyOf = (o:any)=>`${o.aserradero}||${o.tipo}||${o.especie}`;
    const map = new Map<string, any>();
    for (const g of genRows) { const k=keyOf(g); map.set(k,{ aserradero:g.aserradero,tipo:g.tipo,especie:g.especie, tn_generacion_teorica:g.tn_generacion_teorica, p2_base:g.p2_base, tn_egreso_efectiva:0, tn_egreso_estimadas:0, egresos:0, egresos_pendientes_confirmar:0, balance_tn: g.tn_generacion_teorica==null?null:round3(g.tn_generacion_teorica) }); }
    for (const e of egRows) { const k=keyOf(e); const cur = map.get(k) || { aserradero:e.aserradero,tipo:e.tipo,especie:e.especie, tn_generacion_teorica:null, p2_base:null, tn_egreso_efectiva:0, tn_egreso_estimadas:0, egresos:0, egresos_pendientes_confirmar:0, balance_tn:null };
      cur.tn_egreso_efectiva = round3(num(cur.tn_egreso_efectiva)+num(e.tn_egreso_efectiva)); cur.tn_egreso_estimadas = round3(num(cur.tn_egreso_estimadas)+num(e.tn_egreso_estimadas)); cur.egresos += num(e.egresos); cur.egresos_pendientes_confirmar += num(e.egresos_pendientes_confirmar);
      cur.balance_tn = cur.tn_generacion_teorica==null ? null : round3(num(cur.tn_generacion_teorica)-num(cur.tn_egreso_efectiva));
      map.set(k,cur);
    }
    const detalle = Array.from(map.values()).sort((a,b)=> (a.aserradero+a.tipo+a.especie).localeCompare(b.aserradero+b.tipo+b.especie));
    const tot = detalle.reduce((a,r)=>{ a.egresos+=num(r.egresos); a.tn_egreso_efectiva=round3(a.tn_egreso_efectiva+num(r.tn_egreso_efectiva)); a.egresos_pendientes_confirmar+=num(r.egresos_pendientes_confirmar); if(r.tn_generacion_teorica!=null){ a.tn_generacion_teorica=round3(num(a.tn_generacion_teorica)+num(r.tn_generacion_teorica)); a._genOk=true; } if(r.balance_tn!=null){ a.balance_tn=round3(num(a.balance_tn)+num(r.balance_tn)); a._balOk=true; } return a; }, {egresos:0,tn_egreso_efectiva:0,egresos_pendientes_confirmar:0,tn_generacion_teorica:null as number|null,balance_tn:null as number|null,_genOk:false,_balOk:false});
    if(!tot._genOk) tot.tn_generacion_teorica=null; if(!tot._balOk) tot.balance_tn=null; delete (tot as any)._genOk; delete (tot as any)._balOk;
    return { meta: this.meta('subproductos', query, user, rango, scope, { nota: 'Cruce: generación teórica TN (P² desde producción, coef/factorTn por aserradero+especie) vs egresos efectivos en el rango (agregado por aserradero/tipo/especie).' }), totales: tot, detalle };
  }
  subproductosCsv(data:any){ const h=['aserradero','tipo','especie','p2_base','tn_generacion_teorica','tn_egreso_efectiva','tn_egreso_estimadas','egresos','egresos_pendientes_confirmar','balance_tn']; return toCsv(h,(data.detalle||[]).map((r:any)=>h.map(k=>r[k]??''))); }

  // ---------- PALLETS PRODUCCIÓN ----------
  async pallets(query: ReportesQueryDto, user: AuthenticatedUser) {
    validarAdmin(user);
    const rango = this.rango(query);
    const scope = resolveScopeAserradero(user, query.aserradero);
    const params: any[] = [rango.desde, rango.hasta];
    let where = `WHERE v.fecha_d BETWEEN $1::date AND $2::date`;
    if (scope) { params.push(scope); where += ` AND v.aserradero = $${params.length}`; }
    const rows: any[] = await this.dataSource.query(
      `SELECT COALESCE(v.aserradero,'Sin asignar') AS aserradero, v.pallet_id, COALESCE(v.pallet_nombre,'') AS pallet, COALESCE(v.especie_madera,'') AS especie_madera,
              SUM(v.cantidad)::int AS cantidad, ROUND(AVG(v.tarifa_mano_obra)::numeric,4) AS tarifa_mano_obra_prom, ROUND(SUM(v.costo_mano_obra)::numeric,2) AS costo_mano_obra
         FROM vw_rpt_pallets_produccion v
         ${where}
         GROUP BY 1,2,3,4 ORDER BY 1,3`, params);
    const tot = rows.reduce((a,r)=>{ a.cantidad+=num(r.cantidad); a.costo_mano_obra=round2(a.costo_mano_obra+num(r.costo_mano_obra)); return a; }, {cantidad:0,costo_mano_obra:0});
    return { meta: this.meta('pallets_produccion', query, user, rango, scope, { nota: 'Producción diaria de pallets agregada por aserradero/pallet/especie en el rango.' }), totales: tot, detalle: rows.map(r=>({ ...r, costo_mano_obra:round2(r.costo_mano_obra), tarifa_mano_obra_prom: round3(num(r.tarifa_mano_obra_prom)*1000)/1000 })) };
  }
  palletsCsv(data:any){ const h=['aserradero','pallet_id','pallet','especie_madera','cantidad','tarifa_mano_obra_prom','costo_mano_obra']; return toCsv(h,(data.detalle||[]).map((r:any)=>h.map(k=>r[k]??''))); }
}
