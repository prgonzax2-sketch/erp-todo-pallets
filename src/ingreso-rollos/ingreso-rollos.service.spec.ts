import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { IngresoRollosService } from './ingreso-rollos.service.js';
import { IngresoRollo } from './entities/ingreso-rollo.entity.js';
import { Madera } from '../maestros-rollos/entities/madera.entity.js';
import { ProveedorMadera } from '../maestros-rollos/entities/proveedor-madera.entity.js';
import { Quinta } from '../maestros-rollos/entities/quinta.entity.js';
import { Plantacion } from '../maestros-rollos/entities/plantacion.entity.js';
import { Transporte } from '../maestros-rollos/entities/transporte.entity.js';
import { Fletero } from '../maestros-rollos/entities/fletero.entity.js';
import { CuentaCorrienteFleterosService } from '../cuenta-corriente-fleteros/cuenta-corriente-fleteros.service.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

const adminNorte: AuthenticatedUser = { sub: 1, email: 'admin@test.com', rol: 'admin', aserradero: 'Norte' };
const adminGeneral: AuthenticatedUser = { sub: 1, email: 'gral@test.com', rol: 'admin', aserradero: null };
const operario: AuthenticatedUser = { sub: 2, email: 'op@test.com', rol: 'operario' };

function makeRepo(found: any = { id: 1 }) {
  return { findOneBy: vi.fn(async () => found), findOne: vi.fn(async () => null) };
}

describe('IngresoRollosService', () => {
  let service: IngresoRollosService;
  let repo: any;
  let managerRepo: any;
  let ccService: any;
  let dataSource: any;

  const baseDto: any = {
    maderaId: 1, proveedorMaderaId: 2, transporteId: 3, fleteroId: 4,
    nroRemito: 'R-001', fecha: '2026-11-07', aserradero: 'Sur',
    largoMetros: 6, m3: 12, toneladas: 30, precioTnMadera: 150000, precioFleteTn: 18000, ajustesAdicionalesFlete: 5000,
  };

  beforeEach(() => {
    managerRepo = {
      create: vi.fn((x) => ({ id: 10, ...x })),
      save: vi.fn(async (x) => ({ id: x.id ?? 10, ...x })),
      findOne: vi.fn(async () => null),
      findOneBy: vi.fn(async ({ id }: any) => ({ id, aserradero: 'Norte', proveedorMaderaId: 2, nroRemito: 'R-001', fecha: '2026-11-07', toneladas: 30, precioTnMadera: 150000, precioFleteTn: 18000, ajustesAdicionalesFlete: 5000, fleteroId: 4 })),
      delete: vi.fn(),
    };
    repo = {
      findOne: vi.fn(async () => null),
      findOneBy: vi.fn(async ({ id }: any) => ({ id, aserradero: 'Norte', proveedorMaderaId: 2, nroRemito: 'R-001', fecha: '2026-11-07', toneladas: 30, precioTnMadera: 150000, precioFleteTn: 18000, ajustesAdicionalesFlete: 0, fleteroId: 4, m3: 0, largoMetros: 0 })),
      createQueryBuilder: vi.fn(),
    };
    ccService = { syncCreditoViaje: vi.fn(), removeCreditoViaje: vi.fn() };
    dataSource = { transaction: vi.fn(async (fn: any) => fn({ getRepository: () => managerRepo })) };

    service = new IngresoRollosService(
      repo as unknown as Repository<IngresoRollo>,
      makeRepo() as unknown as Repository<Madera>,
      makeRepo() as unknown as Repository<ProveedorMadera>,
      makeRepo() as unknown as Repository<Quinta>,
      makeRepo() as unknown as Repository<Plantacion>,
      makeRepo() as unknown as Repository<Transporte>,
      makeRepo() as unknown as Repository<Fletero>,
      dataSource as unknown as DataSource,
      ccService as unknown as CuentaCorrienteFleterosService,
    );
  });

  it('rechaza rol no admin', async () => {
    await expect(service.create(baseDto, operario)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('asignado fuerza su aserradero y recalcula server-side + sincroniza CC', async () => {
    const res = await service.create(baseDto, adminNorte);
    expect(managerRepo.create).toHaveBeenCalledWith(expect.objectContaining({ aserradero: 'Norte', nroRemito: 'R-001' }));
    expect(managerRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ subtotalBruto: 4500000, iva: 945000, totalMadera: 5445000, totalFleteViaje: 545000 }),
    );
    expect(ccService.syncCreditoViaje).toHaveBeenCalledWith(
      expect.objectContaining({ ingresoRolloId: 10, fleteroId: 4, totalFleteViaje: 545000, aserradero: 'Norte' }),
      expect.anything(),
    );
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(res.id).toBe(10);
  });

  it('rechaza duplicado proveedorMaderaId + nroRemito', async () => {
    managerRepo.findOne.mockResolvedValueOnce({ id: 99 }); // duplicado (chequeo transaccional)
    await expect(service.create(baseDto, adminGeneral)).rejects.toBeInstanceOf(ConflictException);
  });

  it('asignado no puede acceder a ingreso de otro aserradero', async () => {
    repo.findOneBy.mockResolvedValueOnce({ id: 5, aserradero: 'Sur' });
    await expect(service.findOne(5, adminNorte)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delete elimina crédito CC dentro de transacción', async () => {
    repo.findOneBy.mockResolvedValue({ id: 5, aserradero: 'Norte' });
    await service.remove(5, adminNorte);
    expect(ccService.removeCreditoViaje).toHaveBeenCalledWith(5, expect.anything());
    expect(managerRepo.delete).toHaveBeenCalledWith({ id: 5 });
  });
});
