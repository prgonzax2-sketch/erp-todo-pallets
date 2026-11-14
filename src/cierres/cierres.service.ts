import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CierreBovedaPago } from './entities/cierre-boveda-pago.entity.js';
import { CierreArchivo } from './entities/cierre-archivo.entity.js';
import { CierreHistorialLiquidacion } from './entities/cierre-historial-liquidacion.entity.js';

@Injectable()
export class CierresService {
  constructor(
    @InjectRepository(CierreBovedaPago) private readonly bovedaRepo: Repository<CierreBovedaPago>,
    @InjectRepository(CierreArchivo) private readonly archivoRepo: Repository<CierreArchivo>,
    @InjectRepository(CierreHistorialLiquidacion) private readonly historialRepo: Repository<CierreHistorialLiquidacion>,
  ) {}

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar cierres.');
  }

  private scopeAserradero(user: AuthenticatedUser, aserradero?: string | null) {
    if (user.aserradero) return user.aserradero;
    const a = String(aserradero || '').trim();
    return a || null;
  }

  // --- Bóveda de pagos pendientes ---
  async listarBoveda(user: AuthenticatedUser, aserradero?: string) {
    this.validarAdmin(user);
    const scope = this.scopeAserradero(user, aserradero);
    const where: any = {};
    if (scope) where.aserradero = scope;
    const rows = await this.bovedaRepo.find({ where, order: { creadoEn: 'ASC' } });
    return rows.map((r) => ({ ...(r.datos || {}), idUnico: r.idUnico, aserradero: r.aserradero }));
  }

  async guardarBoveda(user: AuthenticatedUser, aserradero: string | undefined, pagos: any[]) {
    this.validarAdmin(user);
    const scope = this.scopeAserradero(user, aserradero);
    if (!scope && !user.aserradero) throw new ForbiddenException('Debes indicar el aserradero.');
    const lista = Array.isArray(pagos) ? pagos : [];
    // reemplazo completo del scope
    await this.bovedaRepo.delete(scope ? { aserradero: scope } : {});
    if (!lista.length) return [];
    const entities = lista.map((p) => this.bovedaRepo.create({
      aserradero: scope,
      idUnico: String(p?.idUnico || `${Date.now()}_${p?.idEmp || Math.random()}`),
      datos: p || {},
    }));
    await this.bovedaRepo.save(entities);
    return this.listarBoveda(user, scope || undefined);
  }

  async eliminarPagoBoveda(user: AuthenticatedUser, idUnico: string, aserradero?: string) {
    this.validarAdmin(user);
    const scope = this.scopeAserradero(user, aserradero);
    const where: any = { idUnico: String(idUnico) };
    if (scope) where.aserradero = scope;
    await this.bovedaRepo.delete(where);
    return { deleted: idUnico };
  }

  // --- Archivo de cierres físicos ---
  async listarArchivos(user: AuthenticatedUser, aserradero?: string) {
    this.validarAdmin(user);
    const scope = this.scopeAserradero(user, aserradero);
    const where: any = {};
    if (scope) where.aserradero = scope;
    const rows = await this.archivoRepo.find({ where, order: { creadoEn: 'DESC' } });
    return rows.map((r) => ({ ...(r.datos || {}), idCierre: r.idCierre, aserradero: r.aserradero || (r.datos as any)?.aserradero || null }));
  }

  async agregarArchivo(user: AuthenticatedUser, aserradero: string | undefined, cierre: any) {
    this.validarAdmin(user);
    const scope = this.scopeAserradero(user, aserradero || cierre?.aserradero);
    const idCierre = String(cierre?.idCierre || Date.now());
    const entity = this.archivoRepo.create({ aserradero: scope, idCierre, datos: { ...(cierre || {}), aserradero: scope || cierre?.aserradero } });
    await this.archivoRepo.save(entity);
    return { ...(entity.datos || {}), idCierre };
  }

  async eliminarArchivo(user: AuthenticatedUser, idCierre: string, aserradero?: string) {
    this.validarAdmin(user);
    if (user.rol !== 'admin') throw new ForbiddenException('No autorizado.');
    // solo admin general puede eliminar históricos (alineado con UI)
    if (user.aserradero) throw new ForbiddenException('Solo un administrador general puede eliminar cierres históricos.');
    const where: any = { idCierre: String(idCierre) };
    if (aserradero) where.aserradero = aserradero;
    await this.archivoRepo.delete(where);
    return { deleted: idCierre };
  }

  // --- Historial liquidaciones (SAC) ---
  async listarHistorial(user: AuthenticatedUser, aserradero?: string) {
    this.validarAdmin(user);
    const scope = this.scopeAserradero(user, aserradero);
    const where: any = {};
    if (scope) where.aserradero = scope;
    const rows = await this.historialRepo.find({ where, order: { creadoEn: 'ASC' } });
    return rows.map((r) => r.datos || {});
  }

  async agregarHistorial(user: AuthenticatedUser, aserradero: string | undefined, items: any[]) {
    this.validarAdmin(user);
    const scope = this.scopeAserradero(user, aserradero);
    if (!scope && !user.aserradero) throw new ForbiddenException('Debes indicar el aserradero.');
    const lista = Array.isArray(items) ? items : [];
    if (!lista.length) return { added: 0 };
    const entities = lista.map((h, i) => {
      const clave = `${h?.idEmp || 0}-${h?.fecha || ''}-${h?.mes || 0}-${h?.anio || 0}-${h?.monto || 0}-${Date.now()}-${i}`;
      return this.historialRepo.create({ aserradero: scope, clave, datos: h || {} });
    });
    await this.historialRepo.save(entities);
    return { added: entities.length };
  }

  /** Cierre atómico lógico: guarda archivo, agrega historial, reemplaza bóveda pendientes para el aserradero. */
  async registrarCierrePeriodo(user: AuthenticatedUser, body: any) {
    this.validarAdmin(user);
    const scope = this.scopeAserradero(user, body?.aserradero);
    if (!scope && !user.aserradero) throw new ForbiddenException('Debes indicar el aserradero.');
    const archivo = body?.archivo;
    const historial = Array.isArray(body?.historial) ? body.historial : [];
    const boveda = Array.isArray(body?.boveda) ? body.boveda : [];

    if (archivo) await this.agregarArchivo(user, scope || undefined, { ...archivo, aserradero: scope || archivo?.aserradero });
    if (historial.length) await this.agregarHistorial(user, scope || undefined, historial);
    await this.guardarBoveda(user, scope || undefined, boveda);

    return { ok: true, archivo: !!archivo, historial: historial.length, boveda: boveda.length };
  }
}
