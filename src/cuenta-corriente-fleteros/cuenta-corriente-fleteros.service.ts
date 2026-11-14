import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Fletero } from '../maestros-rollos/entities/fletero.entity.js';
import { MovimientoCcFletero } from './entities/movimiento-cc-fletero.entity.js';
import { CreateMovimientoDebitoCcDto, ListMovimientosCcDto, TIPOS_DEBITO_CC } from './dto/movimiento-cc-fletero.dto.js';
import { round2 } from '../ingreso-rollos/ingreso-rollos.calculos.js';

@Injectable()
export class CuentaCorrienteFleterosService {
  constructor(
    @InjectRepository(MovimientoCcFletero)
    private readonly movRepo: Repository<MovimientoCcFletero>,
    @InjectRepository(Fletero)
    private readonly fleteroRepo: Repository<Fletero>,
  ) {}

  private validarAdmin(user: AuthenticatedUser) {
    if (user?.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar cuentas corrientes.');
  }

  private repo(manager?: EntityManager) {
    return manager ? manager.getRepository(MovimientoCcFletero) : this.movRepo;
  }

  async validarFleteroExiste(fleteroId: number, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(Fletero) : this.fleteroRepo;
    const f = await repo.findOneBy({ id: fleteroId } as any);
    if (!f) throw new NotFoundException(`Fletero #${fleteroId} no encontrado.`);
    return f;
  }

  /** Sincroniza crédito automático por viaje (create/update de ingreso). Llamar dentro de transacción. */
  async syncCreditoViaje(
    params: { ingresoRolloId: number; fleteroId: number; fecha: string; totalFleteViaje: number; aserradero: string; nroRemito?: string },
    manager: EntityManager,
  ) {
    const repo = manager.getRepository(MovimientoCcFletero);
    const monto = round2(Math.max(0, Number(params.totalFleteViaje) || 0));
    const concepto = params.nroRemito ? `Flete viaje remito ${params.nroRemito}` : `Flete viaje ingreso #${params.ingresoRolloId}`;
    let mov = await repo.findOne({ where: { ingresoRolloId: params.ingresoRolloId } as any });
    if (!mov) {
      mov = repo.create({
        fleteroId: params.fleteroId,
        tipo: 'credito_viaje',
        monto,
        fecha: params.fecha?.slice(0, 10),
        concepto,
        ingresoRolloId: params.ingresoRolloId,
        aserradero: params.aserradero || null,
      } as Partial<MovimientoCcFletero>) as MovimientoCcFletero;
    } else {
      mov.fleteroId = params.fleteroId;
      mov.monto = monto;
      mov.fecha = params.fecha?.slice(0, 10);
      mov.concepto = concepto;
      mov.aserradero = params.aserradero || null;
    }
    return repo.save(mov);
  }

  /** Elimina crédito asociado al ingreso. Llamar dentro de transacción. */
  async removeCreditoViaje(ingresoRolloId: number, manager: EntityManager) {
    const repo = manager.getRepository(MovimientoCcFletero);
    await repo.delete({ ingresoRolloId } as any);
  }

  async registrarDebito(dto: CreateMovimientoDebitoCcDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    if (!TIPOS_DEBITO_CC.includes(dto.tipo)) {
      throw new BadRequestException('Tipo de movimiento manual inválido.');
    }
    if (!(Number(dto.monto) > 0)) throw new BadRequestException('El monto debe ser mayor a 0.');
    await this.validarFleteroExiste(dto.fleteroId);
    const userA = String(user.aserradero || '').trim();
    const dtoA = String(dto.aserradero || '').trim();
    if (userA && dtoA && dtoA !== userA) {
      throw new ForbiddenException('No puedes registrar movimientos para otro aserradero.');
    }
    const aserradero = userA || dtoA || null;
    const mov = this.movRepo.create({
      fleteroId: dto.fleteroId,
      tipo: dto.tipo,
      monto: round2(dto.monto),
      fecha: dto.fecha?.slice(0, 10),
      concepto: dto.concepto?.trim() || null,
      medio: dto.medio?.trim() || null,
      referencia: dto.referencia?.trim() || null,
      observacion: dto.observacion?.trim() || null,
      ingresoRolloId: null,
      aserradero,
    } as Partial<MovimientoCcFletero>);
    return this.movRepo.save(mov);
  }

  async listarMovimientos(query: ListMovimientosCcDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const qb = this.movRepo.createQueryBuilder('m').orderBy('m.fecha', 'DESC').addOrderBy('m.id', 'DESC');
    if (query?.fleteroId) qb.andWhere('m.fleteroId = :fleteroId', { fleteroId: Number(query.fleteroId) });
    if (query?.desde) qb.andWhere('m.fecha >= :desde', { desde: String(query.desde).slice(0, 10) });
    if (query?.hasta) qb.andWhere('m.fecha <= :hasta', { hasta: String(query.hasta).slice(0, 10) });
    const userA = String(user.aserradero || '').trim();
    if (userA) qb.andWhere('m.aserradero = :scopeAserradero', { scopeAserradero: userA });
    return qb.getMany();
  }

  async resumen(query: ListMovimientosCcDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    if (!query?.fleteroId) throw new BadRequestException('Debes indicar fleteroId para el resumen.');
    const fleteroId = Number(query.fleteroId);
    await this.validarFleteroExiste(fleteroId);
    const movimientos = await this.listarMovimientos({ ...query, fleteroId }, user);
    const viajes = movimientos.filter((m) => m.tipo === 'credito_viaje');
    const pagos = movimientos.filter((m) => m.tipo !== 'credito_viaje');
    const totalDevengado = round2(viajes.reduce((s, m) => s + Number(m.monto || 0), 0));
    const totalPagosAdelantos = round2(pagos.reduce((s, m) => s + Number(m.monto || 0), 0));
    const saldoPendiente = round2(totalDevengado - totalPagosAdelantos);
    return { fleteroId, totalDevengado, totalPagosAdelantos, saldoPendiente, viajes, pagos, movimientos };
  }

  private csvEscape(v: unknown) {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async exportCsv(query: ListMovimientosCcDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const rows = await this.listarMovimientos(query, user);
    const header = ['id', 'fleteroId', 'fecha', 'tipo', 'monto', 'concepto', 'medio', 'referencia', 'observacion', 'ingresoRolloId', 'aserradero'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.id, r.fleteroId, r.fecha, r.tipo, r.monto, r.concepto, r.medio, r.referencia, r.observacion, r.ingresoRolloId, r.aserradero].map((v) => this.csvEscape(v)).join(','));
    }
    return '\uFEFF' + lines.join('\r\n');
  }
}
