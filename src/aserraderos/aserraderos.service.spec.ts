import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Aserradero } from './entities/aserradero.entity.js';
import { AserraderosService } from './aserraderos.service.js';

describe('AserraderosService', () => {
  const repository = {
    create: vi.fn((aserradero: Partial<Aserradero>) => aserradero),
    find: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(),
  };
  let service: AserraderosService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AserraderosService(repository as unknown as Repository<Aserradero>);
  });

  it('permite listar y crear aserraderos al administrador general', async () => {
    repository.findOneBy.mockResolvedValue(null);
    repository.save.mockImplementation(async value => value);

    await expect(service.create('Planta Norte', { rol: 'admin' } as AuthenticatedUser))
      .resolves.toMatchObject({ nombre: 'Planta Norte' });
    expect(repository.create).toHaveBeenCalledWith({ nombre: 'Planta Norte' });
  });

  it('impide que un administrador de planta cree o dé de baja aserraderos', async () => {
    const user = { rol: 'admin', aserradero: 'Planta Norte' } as AuthenticatedUser;

    await expect(service.create('Planta Sur', user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deactivate(1, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('limita el catálogo visible al aserradero asignado', async () => {
    repository.find.mockResolvedValue([{ id: 1, nombre: 'Planta Norte', activo: true }]);

    await service.findAll({ rol: 'admin', aserradero: 'Planta Norte' } as AuthenticatedUser);

    expect(repository.find).toHaveBeenCalledWith({ where: { nombre: 'Planta Norte', activo: true } });
  });
});
