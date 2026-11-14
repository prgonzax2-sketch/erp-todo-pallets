import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { Area } from './entities/area.entity.js';
import { AreasService } from './areas.service.js';

describe('AreasService', () => {
  const adminGeneral: AuthenticatedUser = {
    sub: 1,
    email: 'admin@test.com',
    rol: 'admin',
    aserradero: null,
  };
  const adminAsignado: AuthenticatedUser = {
    sub: 2,
    email: 'planta@test.com',
    rol: 'admin',
    aserradero: 'Planta Norte',
  };

  const repo = {
    create: vi.fn((a: Partial<Area>) => a),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(async (v) => v),
  };

  const qb = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
  };
  const aserraderosRepo = {
    findOneBy: vi.fn(),
    createQueryBuilder: vi.fn(() => qb),
  };

  let service: AreasService;

  beforeEach(() => {
    vi.clearAllMocks();
    qb.where.mockReturnThis();
    qb.andWhere.mockReturnThis();
    aserraderosRepo.createQueryBuilder.mockReturnValue(qb);
    service = new AreasService(
      repo as unknown as Repository<Area>,
      aserraderosRepo as unknown as Repository<Aserradero>,
    );
  });

  it('rechaza nombre duplicado normalizado en el mismo aserradero', async () => {
    aserraderosRepo.findOneBy.mockResolvedValue({ id: 10, activo: true });
    repo.find.mockResolvedValue([{ id: 1, nombre: 'Mantenimiento' }]);

    await expect(
      service.create({ aserraderoId: 10, nombre: ' mantenimiento ' }, adminGeneral),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('impide que admin asignado cree, edite o elimine áreas', async () => {
    await expect(
      service.create({ aserraderoId: 10, nombre: 'Área' }, adminAsignado),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update(1, { nombre: 'X' }, adminAsignado),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(1, adminAsignado)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('fuerza GET de admin asignado a su propia planta', async () => {
    qb.getOne.mockResolvedValue({ id: 7, nombre: 'Planta Norte', activo: true });
    repo.find.mockResolvedValue([]);

    await service.findAll(adminAsignado, { aserraderoId: 999 });

    expect(aserraderosRepo.createQueryBuilder).toHaveBeenCalled();
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ aserraderoId: 7 }),
      }),
    );
  });
});
