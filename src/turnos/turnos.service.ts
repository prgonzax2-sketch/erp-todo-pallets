import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { TurnoBorrador } from './entities/turno-borrador.entity.js';
import { Adelanto } from '../adelantos/entities/adelanto.entity.js';

@Injectable()
export class TurnosService {
  constructor(
    @InjectRepository(Empleado) private readonly empleadoRepository: Repository<Empleado>,
    @InjectRepository(TurnoBorrador) private readonly turnoRepository: Repository<TurnoBorrador>,
    @InjectRepository(Adelanto) private readonly adelantoRepository: Repository<Adelanto>,
  ) {}

  async guardarBorrador(body: any, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const { fecha, turno, idEmpleado, datos } = body || {};
    const empleado = await this.validarEmpleado(Number(idEmpleado), user);
    const fechaStr = String(fecha ?? '').slice(0, 10);
    const turnoStr = String(turno ?? '').trim();
    const id = Number(idEmpleado);

    await this.upsertTurnoPg({
      fecha: fechaStr,
      tipoTurno: turnoStr,
      empleadoId: id,
      aserradero: empleado?.aserradero ?? null,
      estado: 'BORRADOR',
      datos: datos || {},
      origen: 'PG',
    });

    return { message: 'Guardado correctamente en el servidor' };
  }

  /** Inserta/actualiza múltiples borradores en lote. Acepta { registros: [...] } o array directo. */
  async guardarBorradoresBulk(body: any, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const registros = Array.isArray(body) ? body : Array.isArray(body?.registros) ? body.registros : [];
    if (!registros.length) {
      return { ok: true, count: 0, message: 'Sin registros para procesar.' };
    }
    if (registros.length > 1000) {
      throw new ForbiddenException('El lote supera el máximo permitido (1000 registros).');
    }

    const empleadosPermitidos = await this.empleadosPermitidos(user);
    const empIds = Array.from(empleadosPermitidos).map((id) => Number(id)).filter((n) => Number.isFinite(n));
    const empMap = await this.mapAserraderoEmpleados(empIds);

    const rows: Partial<TurnoBorrador>[] = [];
    let rechazados = 0;
    for (const r of registros) {
      const idEmpleado = Number(r?.idEmpleado ?? r?.empleadoId);
      const fecha = String(r?.fecha ?? '').slice(0, 10);
      const tipoTurno = String(r?.turno ?? r?.tipoTurno ?? '').trim();
      if (!Number.isFinite(idEmpleado) || !fecha || !tipoTurno) { rechazados += 1; continue; }
      if (!empleadosPermitidos.has(String(idEmpleado))) { rechazados += 1; continue; }
      rows.push(this.buildRow({
        fecha,
        tipoTurno,
        empleadoId: idEmpleado,
        aserradero: empMap.get(idEmpleado) ?? null,
        estado: 'BORRADOR',
        datos: r?.datos || {},
        origen: 'PG_BULK',
      }));
    }

    if (rows.length) {
      // upsert por lote (conflict fecha,tipoTurno,empleadoId)
      await this.turnoRepository.upsert(rows as any, ['fecha', 'tipoTurno', 'empleadoId']);
    }

    return { ok: true, count: rows.length, rechazados, message: 'Borradores guardados en lote.' };
  }

  /** Lectura desde PostgreSQL (Fase 5): contrato legacy idéntico al shadow-read JSON previo. */
  async obtenerRango(desde: string, hasta: string, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const empleadosPermitidos = await this.empleadosPermitidos(user);
    const resultados: { [key: string]: any } = {};

    const desdeStr = String(desde || '').slice(0, 10);
    const hastaStr = String(hasta || '').slice(0, 10);

    const rows = await this.turnoRepository.find({
      where: { fecha: Between(desdeStr, hastaStr) },
      order: { fecha: 'ASC', tipoTurno: 'ASC', empleadoId: 'ASC' },
    });

    const toNum = (v: any) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    for (const row of rows as any[]) {
      const empId = String(row.empleadoId);
      if (!empleadosPermitidos.has(empId)) continue;

      const prefix = row.estado === 'CERRADO' ? 'cerrado' : 'borrador';
      const clave = `${prefix}_${row.fecha}_${row.tipoTurno}`;
      if (!resultados[clave]) resultados[clave] = {};

      const datosEmp: any = {
        hs: toNum(row.hs),
        pal: toNum(row.pal),
        lim: toNum(row.lim),
        car: toNum(row.car),
        des: toNum(row.des),
        precio: toNum(row.precio),
        pres: toNum(row.pres),
      };
      if (row.datosExtra && typeof row.datosExtra === 'object') {
        Object.assign(datosEmp, row.datosExtra);
      }
      resultados[clave][empId] = datosEmp;

      if (prefix === 'cerrado') {
        // Compat legacy: cerrarRango JSON marcaba cerrado:true en la clave cerrada_*
        resultados[clave].cerrado = true;
      }
    }

    // Pre-liquidación (SDD): suma dinámica de adelantos por empleado dentro del rango (inclusive).
    // Se expone de forma aditiva para no romper el contrato legacy borrador_/cerrado_* consumido por FE.
    const adelantosPeriodo: Record<string, { total: number; cantidad: number }> = {};
    const empIds = Array.from(empleadosPermitidos)
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));
    if (empIds.length > 0 && desdeStr && hastaStr) {
      const adelRows = await this.adelantoRepository
        .createQueryBuilder('a')
        .select('a.empleadoId', 'empleadoId')
        .addSelect('COALESCE(SUM(a.montoEntregado), 0)', 'total')
        .addSelect('COUNT(*)', 'cantidad')
        .where('a.empleadoId IN (:...empIds)', { empIds })
        .andWhere('a.fecha::date BETWEEN :desde AND :hasta', { desde: desdeStr, hasta: hastaStr })
        .groupBy('a.empleadoId')
        .getRawMany();
      for (const r of adelRows as any[]) {
        const idStr = String(r.empleadoId ?? r.empleadoid);
        const total = Math.round((Number(r.total) || 0) * 100) / 100;
        const cantidad = Number(r.cantidad) || 0;
        adelantosPeriodo[idStr] = { total, cantidad };
      }
    }
    resultados._adelantosPeriodo = {
      desde: desdeStr,
      hasta: hastaStr,
      porEmpleado: adelantosPeriodo,
    };

    return resultados;
  }

  async cerrarRango(body: any, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const empleadosPermitidos = await this.empleadosPermitidos(user);
    const desde = String(body?.desde || '').slice(0, 10);
    const hasta = String(body?.hasta || '9999-12-31').slice(0, 10);
    const ids = Array.from(empleadosPermitidos)
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));

    if (ids.length) {
      await this.turnoRepository.update(
        { fecha: Between(desde, hasta), empleadoId: In(ids), estado: 'BORRADOR' },
        { estado: 'CERRADO', origen: 'PG' },
      );
    }

    return { message: 'Caja cerrada y días bloqueados.' };
  }

  /** Volcado idempotente JSON -> PG (admin). No borra JSON. Se conserva para despliegues/prod; lectura I/O localizada. */
  async migrarJsonADb(user: AuthenticatedUser, dryRun = false) {
    this.validarAdmin(user);
    const fs = await import('node:fs');
    const path = await import('node:path');
    const archivo = path.resolve(process.cwd(), 'borradores_db.json');
    if (!fs.existsSync(archivo)) {
      return { ok: true, dryRun, archivo, claves: 0, registros: 0, upserts: 0, errores: [] as any[] };
    }

    let db: { [key: string]: any } = {};
    try {
      const data = fs.readFileSync(archivo, 'utf8');
      db = JSON.parse(data || '{}') || {};
    } catch {
      db = {};
    }

    const claves = Object.keys(db || {}).filter((k) => /^borrador_|^cerrado_/.test(k));
    let registros = 0;
    let upserts = 0;
    const errores: Array<{ clave: string; empleadoId: string; error: string }> = [];

    // Pre-cargar empleados para aserradero (best-effort) y evitar N+1.
    const allEmpIds = new Set<number>();
    for (const clave of claves) {
      for (const idStr of Object.keys(db[clave] || {})) {
        const n = Number(idStr);
        if (Number.isFinite(n)) allEmpIds.add(n);
      }
    }
    const empMap = await this.mapAserraderoEmpleados(Array.from(allEmpIds));

    for (const clave of claves) {
      const parsed = this.parseClave(clave);
      if (!parsed) continue;
      const { estado, fecha, tipoTurno } = parsed;
      const empleadosObj = db[clave] || {};
      for (const [idStr, datosEmp] of Object.entries(empleadosObj)) {
        if (idStr === 'cerrado') continue;
        const empleadoId = Number(idStr);
        if (!Number.isFinite(empleadoId)) continue;
        registros += 1;
        const row = this.buildRow({
          fecha,
          tipoTurno,
          empleadoId,
          aserradero: empMap.get(empleadoId) ?? null,
          estado,
          datos: datosEmp,
          origen: 'BACKFILL',
        });
        if (dryRun) continue;
        try {
          await this.turnoRepository.upsert(row as any, ['fecha', 'tipoTurno', 'empleadoId']);
          upserts += 1;
        } catch (e) {
          if (errores.length < 50) errores.push({ clave, empleadoId: idStr, error: String((e as Error)?.message || e) });
        }
      }
    }

    return { ok: true, dryRun, archivo, claves: claves.length, registros, upserts: dryRun ? 0 : upserts, errores };
  }

  // ----------------- helpers PG/JSON -----------------

  private async upsertTurnoPg(input: {
    fecha: string; tipoTurno: string; empleadoId: number; aserradero: string | null; estado: string; datos: any; origen: string;
  }) {
    const row = this.buildRow(input);
    await this.turnoRepository.upsert(row as any, ['fecha', 'tipoTurno', 'empleadoId']);
  }

  private buildRow(input: {
    fecha: string; tipoTurno: string; empleadoId: number; aserradero: string | null; estado: string; datos: any; origen: string;
  }) {
    const d = input.datos && typeof input.datos === 'object' ? input.datos : {};
    const { hs, pal, lim, car, des, precio, pres, ...rest } = d as any;
    const n = (v: any) => {
      if (v === null || v === undefined || v === '') return null;
      const num = Number(v);
      return Number.isFinite(num) ? num : null;
    };
    const fecha = String(input.fecha || '').slice(0, 10);
    return {
      fecha,
      tipoTurno: String(input.tipoTurno || '').trim(),
      empleadoId: Number(input.empleadoId),
      aserradero: input.aserradero ?? null,
      estado: input.estado === 'CERRADO' ? 'CERRADO' : 'BORRADOR',
      hs: n(hs) ?? 0,
      pal: n(pal) ?? 0,
      lim: n(lim) ?? 0,
      car: n(car) ?? 0,
      des: n(des) ?? 0,
      precio: n(precio) ?? 0,
      pres: n(pres) ?? 0,
      datosExtra: Object.keys(rest || {}).length ? rest : null,
      origen: input.origen || null,
    } as Partial<TurnoBorrador>;
  }

  private parseClave(clave: string): { estado: 'BORRADOR' | 'CERRADO'; fecha: string; tipoTurno: string } | null {
    if (clave.startsWith('borrador_')) {
      return { estado: 'BORRADOR', fecha: clave.split('_')[1] || '', tipoTurno: this.tipoTurnoDesdeClave(clave) };
    }
    if (clave.startsWith('cerrado_')) {
      return { estado: 'CERRADO', fecha: clave.split('_')[1] || '', tipoTurno: this.tipoTurnoDesdeClave(clave) };
    }
    return null;
  }

  private tipoTurnoDesdeClave(clave: string): string {
    const parts = clave.split('_');
    // borrador_YYYY-MM-DD_TURNO (turno puede contener chars, pero en práctica MAÑANA/TARDE/NOCHE/UNICO)
    return parts.slice(2).join('_');
  }

  private async mapAserraderoEmpleados(ids: number[]): Promise<Map<number, string | null>> {
    const map = new Map<number, string | null>();
    const uniq = Array.from(new Set(ids.filter((n) => Number.isFinite(n))));
    if (!uniq.length) return map;
    const empleados = await this.empleadoRepository.find({ where: { id: In(uniq) as any }, select: { id: true, aserradero: true } as any });
    for (const e of empleados as any[]) map.set(Number(e.id), e.aserradero ?? null);
    return map;
  }

  // ----------------- auth/scope (sin cambios) -----------------

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar turnos.');
  }

  private async empleadosPermitidos(user: AuthenticatedUser) {
    const empleados = await this.empleadoRepository.find({
      select: { id: true },
      where: user.aserradero ? { aserradero: user.aserradero } : {},
    });
    return new Set(empleados.map((empleado) => String(empleado.id)));
  }

  private async validarEmpleado(id: number, user: AuthenticatedUser) {
    const empleado = await this.empleadoRepository.findOneBy({ id });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) {
      throw new NotFoundException(`El empleado #${id} no existe en tu aserradero.`);
    }
    return empleado;
  }
}