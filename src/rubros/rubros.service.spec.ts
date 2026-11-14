import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Rubro } from './entities/rubro.entity.js';
import { RubrosService } from './rubros.service.js';

describe('RubrosService', () => {
  const adminGeneral: AuthenticatedUser = {
    sub: 1,
    email: 'admin@test.com',
    rol: 'admin',
  };
  const adminAsignado: AuthenticatedUser = {
    sub: 2,
    email: 'planta@test.com',
    rol: 'admin',
    aserradero: 'Planta Norte',
  };

  const repo = {
    create: vi.fn((r: Partial<Rubro>) => r),
    find: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(async (v) => v),
  };

  let service: RubrosService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RubrosService(repo as unknown as Repository<Rubro>);
  });

  it('rechaza nombre duplicado normalizado', async () => {
    repo.find.mockResolvedValue([{ id: 1, nombre: 'Insumos' }]);
    await expect(
      service.create({ nombre: ' insumos ' }, adminGeneral),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('impide escritura a admin asignado y permite lectura', async () => {
    repo.find.mockResolvedValue([]);
    await expect(service.findAll(adminAsignado)).resolves.toEqual([]);
    await expect(
      service.create({ nombre: 'X' }, adminAsignado),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
