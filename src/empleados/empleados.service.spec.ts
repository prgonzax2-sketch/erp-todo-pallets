import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Usuario } from '../auth/entities/usuario.entity.js';
import { Empleado } from './entities/empleado.entity.js';
import { SueldoMensual } from './entities/sueldo-mensual.entity.js';
import { EmpleadosService } from './empleados.service.js';

describe('EmpleadosService', () => {
  const empleadoRepository = {
    create: vi.fn((employee: Partial<Empleado>) => employee),
    delete: vi.fn(),
    find: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
  const sueldoRepository = { create: vi.fn(), findOne: vi.fn(), save: vi.fn() };
  const usuarioRepository = {
    create: vi.fn((user: Partial<Usuario>) => user),
    find: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(),
  };
  const aserraderoRepository = { findOneBy: vi.fn() };
  let service: EmpleadosService;
  let savedEmployee: Partial<Empleado>;
  let savedUser: Partial<Usuario> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    savedUser = null;
    savedEmployee = {
      id: 1,
      nombreCompleto: 'Admin Norte',
      documento: '100',
      cuil: '200',
      puesto: 'Administrativo',
      aserradero: 'Planta Norte',
    };
    empleadoRepository.save.mockImplementation(async employee => {
      savedEmployee = { ...savedEmployee, ...employee, id: 1 };
      return savedEmployee;
    });
    empleadoRepository.findOneBy.mockImplementation(async ({ id }: { id: number }) => id === 1 ? savedEmployee : null);
    usuarioRepository.findOneBy.mockImplementation(async (where: { empleadoId?: number; email?: string }) => {
      if (where.empleadoId === 1) return savedUser;
      if (where.email && where.email === savedUser?.email) return savedUser;
      return null;
    });
    usuarioRepository.save.mockImplementation(async user => {
      savedUser = { ...user, id: 1 };
      return savedUser;
    });
    aserraderoRepository.findOneBy.mockImplementation(async ({ nombre }: { nombre: string }) => ({ id: 1, nombre, activo: true }));
    service = new EmpleadosService(
      empleadoRepository as unknown as Repository<Empleado>,
      sueldoRepository as unknown as Repository<SueldoMensual>,
      usuarioRepository as unknown as Repository<Usuario>,
      aserraderoRepository as unknown as Repository<Aserradero>,
    );
  });

  it('crea el empleado y vincula credenciales de administrador a su planta', async () => {
    const result = await service.create({
      nombreCompleto: 'Admin Norte',
      documento: '100',
      cuil: '200',
      puesto: 'Administrativo',
      aserradero: 'Planta Norte',
      rolUsuario: 'admin_aserradero',
      email: 'admin.norte@example.com',
      password: 'clave-segura',
    }, { rol: 'admin' } as AuthenticatedUser);

    expect(result).toMatchObject({
      aserradero: 'Planta Norte',
      rolUsuario: 'admin_aserradero',
      email: 'admin.norte@example.com',
    });
    expect(savedUser).toMatchObject({ rol: 'admin', aserradero: 'Planta Norte', empleadoId: 1, activo: true });
    expect(savedUser?.passwordHash).not.toBe('clave-segura');
  });

  it('impide a un administrador de planta asignar un empleado a otra planta', async () => {
    await expect(service.create({
      nombreCompleto: 'Operario Sur',
      documento: '101',
      cuil: '201',
      aserradero: 'Planta Sur',
    }, { rol: 'admin', aserradero: 'Planta Norte' } as AuthenticatedUser))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(empleadoRepository.save).not.toHaveBeenCalled();
  });

  it('permite al administrador general listar empleados de una planta elegida', async () => {
    empleadoRepository.find.mockResolvedValue([savedEmployee]);
    usuarioRepository.find.mockResolvedValue([]);
    usuarioRepository.findOneBy.mockResolvedValue(null);

    await service.findAll({ rol: 'admin' } as AuthenticatedUser, 'Planta Norte');

    expect(empleadoRepository.find).toHaveBeenNthCalledWith(1, { where: { aserradero: 'Planta Norte' } });
    expect(aserraderoRepository.findOneBy).toHaveBeenCalledWith({ nombre: 'Planta Norte', activo: true });
  });
});
