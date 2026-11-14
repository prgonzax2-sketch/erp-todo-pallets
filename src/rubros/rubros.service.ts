import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateRubroDto } from './dto/create-rubro.dto.js';
import { UpdateRubroDto } from './dto/update-rubro.dto.js';
import { Rubro } from './entities/rubro.entity.js';

@Injectable()
export class RubrosService {
  constructor(@InjectRepository(Rubro) private readonly repo: Repository<Rubro>) {}

  private esAdminAsignado(user: AuthenticatedUser): boolean {
    return user.rol === 'admin' && !!user.aserradero?.trim();
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden acceder a rubros.');
    }
  }

  private validarAdminGeneral(user: AuthenticatedUser) {
    this.validarAdmin(user);
    if (this.esAdminAsignado(user)) {
      throw new ForbiddenException(
        'Solo un administrador general puede modificar rubros.',
      );
    }
  }

  private normalizarNombre(nombre?: string): string {
    const value = nombre?.trim();
    if (!value) throw new BadRequestException('El nombre es obligatorio.');
    return value;
  }

  private async assertNombreUnico(nombre: string, excludeId?: number) {
    const items = await this.repo.find({ select: { id: true, nombre: true } });
    const key = nombre.trim().toLowerCase();
    const dup = items.find(
      (r) => r.id !== excludeId && r.nombre.trim().toLowerCase() === key,
    );
    if (dup) throw new ConflictException('Ya existe un rubro con ese nombre.');
  }

  async findAll(user: AuthenticatedUser) {
    this.validarAdmin(user);
    return this.repo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException(`Rubro #${id} no encontrado.`);
    return item;
  }

  async create(dto: CreateRubroDto, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    const nombre = this.normalizarNombre(dto.nombre);
    await this.assertNombreUnico(nombre);
    return this.repo.save(
      this.repo.create({ nombre, activo: dto.activo ?? true }),
    );
  }

  async update(id: number, dto: UpdateRubroDto, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException(`Rubro #${id} no encontrado.`);
    if (dto.nombre !== undefined) {
      const nombre = this.normalizarNombre(dto.nombre);
      await this.assertNombreUnico(nombre, id);
      item.nombre = nombre;
    }
    if (dto.activo !== undefined) item.activo = dto.activo;
    return this.repo.save(item);
  }

  async remove(id: number, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException(`Rubro #${id} no encontrado.`);
    item.activo = false;
    await this.repo.save(item);
    return { message: `Rubro #${id} dado de baja.` };
  }
}
