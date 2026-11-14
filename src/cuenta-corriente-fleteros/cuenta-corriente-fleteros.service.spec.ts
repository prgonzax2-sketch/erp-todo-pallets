import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CuentaCorrienteFleterosService } from './cuenta-corriente-fleteros.service.js';
import { MovimientoCcFletero } from './entities/movimiento-cc-fletero.entity.js';
import { Fletero } from '../maestros-rollos/entities/fletero.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

const adminUser: AuthenticatedUser = { sub: 1, email: 'admin@test.com', rol: 'admin', aserradero: 'Norte' };
const operarioUser: AuthenticatedUser = { sub: 2, email: 'op@test.com', rol: 'operario' };

describe('CuentaCorrienteFleterosService', () => {
  let service: CuentaCorrienteFleterosService;
  let movRepo: any;
  let fleteroRepo: any;

  beforeEach(() => {
    movRepo = {
      create: vi.fn((x) => x),
      save: vi.fn(async (x) => ({ id: 99, ...x })),
      findOne: vi.fn(),
      delete: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    fleteroRepo = { findOneBy: vi.fn(async ({ id }: any) => ({ id, nombre: 'Fletero' })) };
    service = new CuentaCorrienteFleterosService(
      movRepo as unknown as Repository<MovimientoCcFletero>,
      fleteroRepo as unknown as Repository<Fletero>,
    );
  });

  it('rechaza rol no admin', async () => {
    await expect(service.registrarDebito({ fleteroId: 1, tipo: 'debito_pago', monto: 100, fecha: '2026-11-07' } as any, operarioUser))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('registra débito manual con monto > 0', async () => {
    const res = await service.registrarDebito({ fleteroId: 1, tipo: 'debito_pago', monto: 1500.5, fecha: '2026-11-07', concepto: 'Pago' } as any, adminUser);
    expect(movRepo.create).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'debito_pago', monto: 1500.5, ingresoRolloId: null }));
    expect(res.id).toBe(99);
  });

  it('rechaza monto <= 0', async () => {
    await expect(service.registrarDebito({ fleteroId: 1, tipo: 'debito_pago', monto: 0, fecha: '2026-11-07' } as any, adminUser))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('calcula resumen global: devengado - pagos = saldo', async () => {
    const rows = [
      { id: 1, tipo: 'credito_viaje', monto: 1000, fecha: '2026-11-01' },
      { id: 2, tipo: 'credito_viaje', monto: 500, fecha: '2026-11-02' },
      { id: 3, tipo: 'debito_pago', monto: 300, fecha: '2026-11-03' },
      { id: 4, tipo: 'debito_adelanto', monto: 200, fecha: '2026-11-04' },
    ];
    const qb = { orderBy: vi.fn().mockReturnThis(), addOrderBy: vi.fn().mockReturnThis(), andWhere: vi.fn().mockReturnThis(), getMany: vi.fn().mockResolvedValue(rows) };
    movRepo.createQueryBuilder.mockReturnValue(qb);

    const res = await service.resumen({ fleteroId: 1 } as any, adminUser);
    expect(res.totalDevengado).toBe(1500);
    expect(res.totalPagosAdelantos).toBe(500);
    expect(res.saldoPendiente).toBe(1000);
    expect(res.viajes).toHaveLength(2);
    expect(res.pagos).toHaveLength(2);
  });

  it('syncCreditoViaje crea o actualiza crédito por ingresoRolloId (transaccional)', async () => {
    const saved: any[] = [];
    const managerRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((x) => ({ id: 7, ...x })),
      save: vi.fn(async (x) => { saved.push(x); return x; }),
    };
    const manager = { getRepository: vi.fn(() => managerRepo) } as any;
    await service.syncCreditoViaje({ ingresoRolloId: 10, fleteroId: 2, fecha: '2026-11-07', totalFleteViaje: 545000, aserradero: 'Norte', nroRemito: 'R-1' }, manager);
    expect(managerRepo.create).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'credito_viaje', ingresoRolloId: 10, fleteroId: 2, monto: 545000 }));
  });
});
