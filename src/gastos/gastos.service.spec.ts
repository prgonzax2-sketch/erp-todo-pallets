import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { GastosService } from './gastos.service.js';
import { GastoComprobante } from './entities/gasto-comprobante.entity.js';
import { GastoLinea } from './entities/gasto-linea.entity.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { Area } from '../areas/entities/area.entity.js';
import { Proveedor } from '../proveedores/entities/proveedor.entity.js';
import { Rubro } from '../rubros/entities/rubro.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

const adminGeneral: AuthenticatedUser = { sub: 1, email: 'gral@test.com', rol: 'admin', aserradero: null };
const adminAsignado: AuthenticatedUser = { sub: 2, email: 'asig@test.com', rol: 'admin', aserradero: 'Norte' };
const operario: AuthenticatedUser = { sub: 3, email: 'op@test.com', rol: 'operario' };

function qbOne(result: any) {
  const qb: any = {};
  qb.where = vi.fn(() => qb);
  qb.andWhere = vi.fn(() => qb);
  qb.select = vi.fn(() => qb);
  qb.addSelect = vi.fn(() => qb);
  qb.leftJoinAndSelect = vi.fn(() => qb);
  qb.orderBy = vi.fn(() => qb);
  qb.addOrderBy = vi.fn(() => qb);
  qb.skip = vi.fn(() => qb);
  qb.take = vi.fn(() => qb);
  qb.clone = vi.fn(() => qb);
  qb.getOne = vi.fn(async () => result);
  qb.getManyAndCount = vi.fn(async () => [[], 0]);
  qb.getRawOne = vi.fn(async () => null);
  qb.getMany = vi.fn(async () => []);
  qb.whereInIds = vi.fn(() => qb);
  return qb;
}

describe('GastosService', () => {
  let service: GastosService;
  let repo: any;
  let lineasRepo: any;
  let aserraderosRepo: any;
  let areasRepo: any;
  let proveedoresRepo: any;
  let rubrosRepo: any;
  let dataSource: any;
  let manager: any;
  let comprobanteMgrRepo: any;
  let lineaMgrRepo: any;
  let aserraderoMgrRepo: any;
  let areaMgrRepo: any;
  let proveedorMgrRepo: any;
  let rubroMgrRepo: any;

  const baseCreate: any = {
    areaId: 10,
    fecha: '2026-11-08',
    proveedorId: null,
    tipoComprobante: 'ORDEN',
    responsable: 'Diego',
    ivaAlicuota: 21,
    ivaExento: false,
    otrosTributos: 0,
    lineas: [{ rubroId: 5, cantidad: 2, precioUnitario: 1000 }],
  };

  beforeEach(() => {
    let savedComprobante: any = null;
    comprobanteMgrRepo = {
      create: vi.fn((x) => ({ ...x })),
      save: vi.fn(async (x) => {
        if (!x.id) x.id = 77;
        savedComprobante = { ...savedComprobante, ...x };
        return { ...x };
      }),
      findOne: vi.fn(async ({ where }: any) => {
        if (where?.id === 77) {
          return {
            id: 77,
            aserraderoId: 1,
            aserraderoNombre: 'Norte',
            areaId: 10,
            areaNombre: 'Pallets',
            fecha: '2026-11-08',
            mes: 11,
            anio: 2026,
            proveedorId: null,
            tipoComprobante: 'ORDEN',
            numeroComprobante: 'ORDEN-77',
            responsable: 'Diego',
            estado: 'BORRADOR',
            ivaAlicuota: 21,
            ivaExento: false,
            otrosTributos: 0,
            subtotalNeto: 2000,
            ivaMonto: 420,
            total: 2420,
            lineas: [{ id: 1, cantidad: 2, precioUnitario: 1000, neto: 2000, rubroId: 5 }],
            ...savedComprobante,
          };
        }
        return null;
      }),
      createQueryBuilder: vi.fn(() => qbOne(null)),
    };
    lineaMgrRepo = {
      create: vi.fn((x) => ({ id: 1, ...x })),
      save: vi.fn(async (x) => x),
      delete: vi.fn(async () => ({ affected: 1 })),
    };
    const qbAserradero = qbOne({ id: 1, nombre: 'Norte', activo: true });
    aserraderoMgrRepo = {
      findOneBy: vi.fn(async ({ id }: any) => (id === 1 ? { id: 1, nombre: 'Norte', activo: true } : null)),
      createQueryBuilder: vi.fn(() => qbAserradero),
    };
    areaMgrRepo = {
      findOne: vi.fn(async ({ where }: any) =>
        where?.id === 10 ? { id: 10, aserraderoId: 1, nombre: 'Pallets', activo: true } : null,
      ),
    };
    proveedorMgrRepo = { findOneBy: vi.fn(async () => null) };
    rubroMgrRepo = { findOneBy: vi.fn(async ({ id }: any) => ({ id, nombre: 'Insumos', activo: true })) };

    manager = {
      getRepository: vi.fn((entity: any) => {
        if (entity === GastoComprobante) return comprobanteMgrRepo;
        if (entity === GastoLinea) return lineaMgrRepo;
        if (entity === Aserradero) return aserraderoMgrRepo;
        if (entity === Area) return areaMgrRepo;
        if (entity === Proveedor) return proveedorMgrRepo;
        if (entity === Rubro) return rubroMgrRepo;
        return { findOneBy: vi.fn(), findOne: vi.fn(), createQueryBuilder: vi.fn(() => qbOne(null)), create: vi.fn((x) => x), save: vi.fn(async (x) => x) };
      }),
    };

    repo = {
      findOne: vi.fn(async () => null),
      createQueryBuilder: vi.fn(() => qbOne(null)),
    };
    lineasRepo = {};
    aserraderosRepo = {
      findOneBy: vi.fn(async ({ id }: any) => (id === 1 ? { id: 1, nombre: 'Norte', activo: true } : null)),
      createQueryBuilder: vi.fn(() => qbOne({ id: 1, nombre: 'Norte', activo: true })),
    };
    areasRepo = { findOne: vi.fn() };
    proveedoresRepo = { findOneBy: vi.fn() };
    rubrosRepo = { findOneBy: vi.fn() };
    dataSource = { transaction: vi.fn(async (fn: any) => fn(manager)) };

    service = new GastosService(
      repo as unknown as Repository<GastoComprobante>,
      lineasRepo as unknown as Repository<GastoLinea>,
      aserraderosRepo as unknown as Repository<Aserradero>,
      areasRepo as unknown as Repository<Area>,
      proveedoresRepo as unknown as Repository<Proveedor>,
      rubrosRepo as unknown as Repository<Rubro>,
      dataSource as unknown as DataSource,
    );
  });

  it('rechaza rol no admin', async () => {
    await expect(service.create(baseCreate, operario)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admin asignado queda forzado a su aserradero y calcula en BE', async () => {
    const res = await service.create(baseCreate, adminAsignado);
    expect(comprobanteMgrRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        aserraderoId: 1,
        aserraderoNombre: 'Norte',
        areaId: 10,
        estado: 'BORRADOR',
      }),
    );
    expect(comprobanteMgrRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ subtotalNeto: 2000, ivaMonto: 420, total: 2420 }),
    );
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(res.id).toBe(77);
  });

  it('permite proveedor null (tickets menores)', async () => {
    await service.create({ ...baseCreate, proveedorId: null, proveedorNombre: 'Caja chica' }, adminGeneral);
    expect(comprobanteMgrRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ proveedorId: null, proveedorNombre: 'Caja chica' }),
    );
  });

  it('autogenera número interno [TIPO]-[ID_BD] cuando se omite en tipo interno', async () => {
    await service.create({ ...baseCreate, tipoComprobante: 'ORDEN', numeroComprobante: null }, adminGeneral);
    // segundo save asigna numero autogenerado
    const saves = comprobanteMgrRepo.save.mock.calls.map((c: any[]) => c[0]);
    expect(saves.some((s: any) => s.numeroComprobante === 'ORDEN-77')).toBe(true);
  });

  it('mapea conflicto de unicidad fiscal a 409', async () => {
    proveedorMgrRepo.findOneBy.mockResolvedValueOnce({ id: 3, razonSocial: 'Proveedor Test', activo: true });
    // precheck fiscal para FACTURA_A con número
    const fiscalQb = qbOne({ id: 99 });
    comprobanteMgrRepo.createQueryBuilder.mockReturnValueOnce(fiscalQb);
    await expect(
      service.create(
        {
          ...baseCreate,
          tipoComprobante: 'FACTURA_A',
          proveedorId: 3,
          puntoVenta: '0001',
          numeroComprobante: '00001234',
        },
        adminGeneral,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('confirmar requiere BORRADOR y al menos 1 línea', async () => {
    comprobanteMgrRepo.findOne.mockResolvedValueOnce({
      id: 77, estado: 'BORRADOR', aserraderoId: 1, tipoComprobante: 'ORDEN', numeroComprobante: 'ORDEN-77',
      ivaAlicuota: 21, ivaExento: false, otrosTributos: 0, lineas: [],
    });
    await expect(service.confirmar(77, adminAsignado)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('anular exige motivo y marca auditoría', async () => {
    comprobanteMgrRepo.findOne.mockResolvedValueOnce({ id: 77, estado: 'CONFIRMADO', aserraderoId: 1 });
    await expect(service.anular(77, { motivo: 'x' } as any, adminAsignado)).rejects.toBeInstanceOf(BadRequestException);

    comprobanteMgrRepo.findOne.mockResolvedValueOnce({ id: 77, estado: 'CONFIRMADO', aserraderoId: 1 });
    await service.anular(77, { motivo: 'Carga duplicada' }, adminAsignado);
    expect(comprobanteMgrRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'ANULADO', anuladoMotivo: 'Carga duplicada', anuladoPor: 'asig@test.com' }),
    );
  });

  it('admin asignado no accede a gasto de otro aserradero', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 55, aserraderoId: 2, estado: 'BORRADOR', lineas: [] });
    await expect(service.findOne(55, adminAsignado)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
