import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ClientesService } from './clientes.service.js';
import { Cliente } from './entities/cliente.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

describe('ClientesService', () => {
  const adminUser: AuthenticatedUser = {
    sub: 1,
    email: 'admin@test.com',
    rol: 'admin',
    aserradero: 'Norte',
  };

  const operarioUser: AuthenticatedUser = {
    sub: 2,
    email: 'operario@test.com',
    rol: 'operario',
  };

  const mockQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([
      { id: 1, nombre: 'Pallets Argentina', activo: true, aserradero: 'Norte' },
    ]),
  };

  const mockRepository = {
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    findOneBy: vi.fn(),
    create: vi.fn((data: Partial<Cliente>) => data),
    save: vi.fn((data: Partial<Cliente>) => Promise.resolve({ id: 1, ...data })),
  };

  let service: ClientesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClientesService(mockRepository as unknown as Repository<Cliente>);
  });

  it('permite listar clientes solo a administradores', async () => {
    const res = await service.findAll(adminUser);
    expect(res).toHaveLength(1);
    expect(res[0].nombre).toBe('Pallets Argentina');

    await expect(service.findAll(operarioUser)).rejects.toThrow(ForbiddenException);
  });

  it('crea un cliente exitosamente con su aserradero', async () => {
    const res = await service.create(
      { nombre: 'Nuevo Cliente SA', telefono: '123456' },
      adminUser,
    );
    expect(res.nombre).toBe('Nuevo Cliente SA');
    expect(res.aserradero).toBe('Norte');
  });

  it('rechaza la creación de un cliente con nombre vacío', async () => {
    await expect(
      service.create({ nombre: '   ' }, adminUser),
    ).rejects.toThrow(BadRequestException);
  });

  it('da de baja lógica a un cliente', async () => {
    mockRepository.findOneBy.mockResolvedValue({ id: 1, nombre: 'Cliente SA', activo: true });
    const res = await service.remove(1, adminUser);
    expect(res.message).toContain('baja exitosamente');
    expect(mockRepository.save).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
  });
});

