import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { Usuario } from './entities/usuario.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const usuarioRepository = { find: vi.fn(), findOneBy: vi.fn(), save: vi.fn() };
  const aserraderoRepository = { findOneBy: vi.fn() };
  const empleadoRepository = { find: vi.fn(), findOneBy: vi.fn() };
  const jwtService = { signAsync: vi.fn().mockResolvedValue('signed-token') };
  const usuario = {
    id: 12,
    email: 'admin.norte@example.com',
    passwordHash: 'stored-hash',
    rol: 'admin',
    aserradero: 'Planta Norte',
    empleadoId: 12,
    activo: true,
  } as Usuario;
  let service: AuthService;
  let aserraderoActivo: boolean;
  let empleadoActivo: boolean;

  beforeAll(async () => {
    usuario.passwordHash = await bcrypt.hash('password', 4);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    aserraderoActivo = true;
    empleadoActivo = true;
    usuarioRepository.findOneBy.mockResolvedValue(usuario);
    aserraderoRepository.findOneBy.mockImplementation(async () => aserraderoActivo ? { nombre: 'Planta Norte', activo: true } : null);
    empleadoRepository.findOneBy.mockImplementation(async () => empleadoActivo ? { id: 12, estaActivo: true } : null);
    service = new AuthService(
      usuarioRepository as unknown as Repository<Usuario>,
      aserraderoRepository as unknown as Repository<Aserradero>,
      empleadoRepository as unknown as Repository<Empleado>,
      jwtService as never,
    );
  });

  it('incluye el aserradero asignado en la sesión', async () => {
    const result = await service.login({ email: usuario.email, password: 'password' } as LoginDto);

    expect(result).toMatchObject({ access_token: 'signed-token', rol: 'admin', aserradero: 'Planta Norte' });
  });

  it('rechaza el acceso cuando el aserradero está dado de baja', async () => {
    aserraderoActivo = false;

    await expect(service.login({ email: usuario.email, password: 'password' } as LoginDto))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza el acceso cuando el empleado vinculado está inactivo', async () => {
    empleadoActivo = false;

    await expect(service.login({ email: usuario.email, password: 'password' } as LoginDto))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lista datos de cuenta sin exponer el hash de contraseña', async () => {
    usuarioRepository.find.mockResolvedValue([usuario]);
    empleadoRepository.find.mockResolvedValue([{ id: 12, nombreCompleto: 'Admin Norte' }]);

    const users = await service.listarUsuarios();

    expect(users).toEqual([expect.objectContaining({
      id: 12,
      email: usuario.email,
      empleado: 'Admin Norte',
      aserradero: 'Planta Norte',
    })]);
    expect(users[0]).not.toHaveProperty('passwordHash');
  });

  it('restablece la contraseña guardando solo un hash nuevo', async () => {
    usuarioRepository.save.mockImplementation(async value => value);

    const result = await service.actualizarAcceso(12, 'admin.actualizado@example.com', 'clave-nueva');

    expect(result).toMatchObject({ id: 12, email: 'admin.actualizado@example.com', activo: true });
    expect(usuario.passwordHash).not.toBe('clave-nueva');
    await expect(bcrypt.compare('clave-nueva', usuario.passwordHash)).resolves.toBe(true);
    expect(result).not.toHaveProperty('passwordHash');
  });
});
