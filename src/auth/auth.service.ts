import { ConflictException, Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Usuario } from './entities/usuario.entity.js';
import { LoginDto } from './dto/login.dto.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private usuarioRepository: Repository<Usuario>,
    @InjectRepository(Aserradero) private aserraderoRepository: Repository<Aserradero>,
    @InjectRepository(Empleado) private empleadoRepository: Repository<Empleado>,
    private jwtService: JwtService,
  ) {}

  async register(email: string, password: string, rol: string = 'empleado', empleadoId?: number, aserradero?: string) {
    const existe = await this.usuarioRepository.findOneBy({ email });
    if (existe) {
      throw new BadRequestException('El correo ya está registrado.');
    }
    if (aserradero && !await this.aserraderoRepository.findOneBy({ nombre: aserradero, activo: true })) {
      throw new BadRequestException('El aserradero asignado no existe o está dado de baja.');
    }
    if (empleadoId) {
      const empleado = await this.empleadoRepository.findOneBy({ id: empleadoId });
      if (!empleado || (aserradero && empleado.aserradero !== aserradero)) {
        throw new BadRequestException('El empleado no existe o no pertenece al aserradero asignado.');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const nuevoUsuario = this.usuarioRepository.create({
      email,
      passwordHash,
      rol,
      empleadoId,
      aserradero,
    });

    return await this.usuarioRepository.save(nuevoUsuario);
  }

  async login(loginDto: LoginDto) {
    if (!loginDto.email || !loginDto.password) {
      throw new UnauthorizedException('Por favor, ingresa el correo y la contraseña.');
    }

    const usuario = await this.usuarioRepository.findOneBy({ email: loginDto.email });
    if (!usuario) {
      throw new UnauthorizedException('Usuario incorrecto.');
    }

    const esValida = await bcrypt.compare(loginDto.password, usuario.passwordHash);
    if (!esValida) {
      throw new UnauthorizedException('Contraseña incorrecta.');
    }

    const aserraderoValido = !usuario.aserradero || await this.aserraderoRepository.findOneBy({ nombre: usuario.aserradero, activo: true });
    const empleadoValido = !usuario.empleadoId || await this.empleadoRepository.findOneBy({ id: usuario.empleadoId, estaActivo: true });
    if (usuario.activo === false || !aserraderoValido || !empleadoValido) {
      throw new UnauthorizedException('Usuario deshabilitado o sin acceso. Contacte al administrador.');
    }

    const payload = { sub: usuario.id, email: usuario.email, rol: usuario.rol, empleadoId: usuario.empleadoId, aserradero: usuario.aserradero };
    return {
      access_token: await this.jwtService.signAsync(payload),
      rol: usuario.rol,
      email: usuario.email,
      aserradero: usuario.aserradero,
    };
  }

  async listarUsuarios() {
    const usuarios = await this.usuarioRepository.find({ order: { email: 'ASC' } });
    const empleados = usuarios.length
      ? await this.empleadoRepository.find({ where: { id: In(usuarios.map(usuario => usuario.empleadoId).filter((id): id is number => Boolean(id))) } })
      : [];
    const empleadosPorId = new Map(empleados.map(empleado => [empleado.id, empleado]));
    return usuarios.map(usuario => ({
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      aserradero: usuario.aserradero,
      empleadoId: usuario.empleadoId,
      empleado: usuario.empleadoId ? empleadosPorId.get(usuario.empleadoId)?.nombreCompleto || null : null,
      activo: usuario.activo,
      fechaCreacion: usuario.fechaCreacion,
    }));
  }

  async actualizarAcceso(id: number, email: string, password?: string) {
    const usuario = await this.usuarioRepository.findOneBy({ id });
    if (!usuario) throw new NotFoundException(`El usuario #${id} no existe.`);
    const correo = email?.trim().toLowerCase();
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      throw new BadRequestException('Ingresa un correo electrónico válido.');
    }
    const otroUsuario = await this.usuarioRepository.findOneBy({ email: correo });
    if (otroUsuario && otroUsuario.id !== id) throw new ConflictException('Ese correo ya pertenece a otra cuenta.');
    if (password !== undefined && password.length > 0 && password.length < 6) {
      throw new BadRequestException('La contraseña nueva debe tener al menos 6 caracteres.');
    }
    usuario.email = correo;
    if (password) usuario.passwordHash = await bcrypt.hash(password, 10);
    usuario.activo = true;
    const guardado = await this.usuarioRepository.save(usuario);
    return { id: guardado.id, email: guardado.email, rol: guardado.rol, aserradero: guardado.aserradero, activo: guardado.activo };
  }
}