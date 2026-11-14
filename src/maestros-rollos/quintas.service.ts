import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Quinta } from './entities/quinta.entity.js';
import { CreateQuintaDto, UpdateQuintaDto } from './dto/quinta.dto.js';

@Injectable()
export class QuintasService {
  constructor(@InjectRepository(Quinta) private readonly repo: Repository<Quinta>) {}

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
    if (!item) throw new NotFoundException(`Quinta #${id} no encontrada.`);
    return item;
  }

  async create(dto: CreateQuintaDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const nombre = dto.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
    return this.repo.save(this.repo.create({ nombre, proveedorMaderaId: dto.proveedorMaderaId ?? null, activo: dto.activo ?? true }));
  }

  async update(id: number, dto: UpdateQuintaDto, user: AuthenticatedUser) {
    const item = await this.findOne(id, user);
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
      item.nombre = nombre;
    }
    if (dto.proveedorMaderaId !== undefined) item.proveedorMaderaId = dto.proveedorMaderaId ?? null;
    if (dto.activo !== undefined) item.activo = dto.activo;
    return this.repo.save(item);
  }

  async remove(id: number, user: AuthenticatedUser) {
    const item = await this.findOne(id, user);
    item.activo = false;
    await this.repo.save(item);
    return { message: `Quinta #${id} dada de baja.` };
  }
}
