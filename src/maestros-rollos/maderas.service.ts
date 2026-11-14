import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Madera } from './entities/madera.entity.js';
import { CreateMaderaDto, UpdateMaderaDto } from './dto/madera.dto.js';

@Injectable()
export class MaderasService {
  constructor(@InjectRepository(Madera) private readonly repo: Repository<Madera>) {}

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
    if (!item) throw new NotFoundException(`Madera #${id} no encontrada.`);
    return item;
  }

  async create(dto: CreateMaderaDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const nombre = dto.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
    return this.repo.save(this.repo.create({ nombre, activo: dto.activo ?? true }));
  }

  async update(id: number, dto: UpdateMaderaDto, user: AuthenticatedUser) {
    const item = await this.findOne(id, user);
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
      item.nombre = nombre;
    }
    if (dto.activo !== undefined) item.activo = dto.activo;
    return this.repo.save(item);
  }

  async remove(id: number, user: AuthenticatedUser) {
    const item = await this.findOne(id, user);
    item.activo = false;
    await this.repo.save(item);
    return { message: `Madera #${id} dada de baja.` };
  }
}
