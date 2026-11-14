import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Plantacion } from './entities/plantacion.entity.js';
import { CreatePlantacionDto, UpdatePlantacionDto } from './dto/plantacion.dto.js';

@Injectable()
export class PlantacionesService {
  constructor(@InjectRepository(Plantacion) private readonly repo: Repository<Plantacion>) {}

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar catálogos.');
  }

  async findAll(user: AuthenticatedUser) {
    this.validarAdmin(user);
    return this.repo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const item = await this.repo.findOneBy({ id } as any);
    if (!item) throw new NotFoundException(`Plantación #${id} no encontrada.`);
    return item;
  }

  async create(dto: CreatePlantacionDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const nombre = dto.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
    return this.repo.save(this.repo.create({ nombre, quintaId: dto.quintaId ?? null, activo: dto.activo ?? true }));
  }

  async update(id: number, dto: UpdatePlantacionDto, user: AuthenticatedUser) {
    const item = await this.findOne(id, user);
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
      item.nombre = nombre;
    }
    if (dto.quintaId !== undefined) item.quintaId = dto.quintaId ?? null;
    if (dto.activo !== undefined) item.activo = dto.activo;
    return this.repo.save(item);
  }

  async remove(id: number, user: AuthenticatedUser) {
    const item = await this.findOne(id, user);
    item.activo = false;
    await this.repo.save(item);
    return { message: `Plantación #${id} dada de baja.` };
  }
}
