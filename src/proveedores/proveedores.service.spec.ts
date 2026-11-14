import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Rubro } from '../rubros/entities/rubro.entity.js';
import { Proveedor } from './entities/proveedor.entity.js';
import { ProveedoresService } from './proveedores.service.js';
import { isValidCuit, normalizeCuit } from '../common/validators/cuit.js';

describe('ProveedoresService', () => {
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
    create: vi.fn((p: Partial<Proveedor>) => p),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(async (v) => ({ id: 1, ...v })),
  };
  const rubrosRepo = { findOneBy: vi.fn() };

  let service: ProveedoresService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProveedoresService(
      repo as unknown as Repository<Proveedor>,
      rubrosRepo as unknown as Repository<Rubro>,
    );
  });

  it('permite CUIT vacío/opcional y normaliza CUIT válido informado', async () => {
    await service.create({ razonSocial: 'Acme SA', cuit: '' }, adminGeneral);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ cuit: null }),
    );

    vi.clearAllMocks();
    // 20-12345678-6 es un CUIT de ejemplo comúnmente usado en tests; si no valida, usamos uno calculado.
    // Calculamos un CUIT válido: 20-00000000-? => 5*2+4*0*7? easier use known valid 20-12345678-? Let's compute.
    const validCuit = '20123456786';
    expect(isValidCuit(validCuit)).toBe(true);
    await service.create({ razonSocial: 'Beta SA', cuit: '20-12345678-6' }, adminGeneral);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ cuit: '20123456786' }),
    );
  });

  it('rechaza CUIT con dígito verificador inválido cuando se informa', async () => {
    expect(isValidCuit('20-12345678-0')).toBe(false);
    expect(normalizeCuit('')).toBeNull();
    // El servicio normaliza; la validación fuerte está en DTO/util. Verificamos util.
    expect(isValidCuit('123')).toBe(false);
  });

  it('impide que admin asignado modifique proveedores pero permite lectura', async () => {
    repo.find.mockResolvedValue([]);
    await expect(service.findAll(adminAsignado)).resolves.toEqual([]);
    await expect(
      service.create({ razonSocial: 'X' }, adminAsignado),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza rubro habitual inexistente', async () => {
    rubrosRepo.findOneBy.mockResolvedValue(null);
    await expect(
      service.create({ razonSocial: 'X', rubroHabitualId: 99 }, adminGeneral),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
