import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { ProveedorMadera } from './entities/proveedor-madera.entity.js';
import { CreateProveedorMaderaDto, UpdateProveedorMaderaDto } from './dto/proveedor-madera.dto.js';

@Injectable()
export class ProveedoresMaderaService {
  constructor(@InjectRepository(ProveedorMadera) private readonly repo: Repository<ProveedorMadera>) {}

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
    if (!item) throw new NotFoundException(`Proveedor de madera #${id} no encontrado.`);
    return item;
  }

  async create(dto: CreateProveedorMaderaDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const nombre = dto.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
    return this.repo.save(this.repo.create({ nombre, cuit: dto.cuit?.trim() || null, activo: dto.activo ?? true }));
  }

  async update(id: number, dto: UpdateProveedorMaderaDto, user: AuthenticatedUser) {
    const item = await this.findOne(id, user);
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
      item.nombre = nombre;
    }
    if (dto.cuit !== undefined) item.cuit = dto.cuit?.trim() || null;
    if (dto.activo !== undefined) item.activo = dto.activo;
    return this.repo.save(item);
  }

  async remove(id: number, user: AuthenticatedUser) {
    const item = await this.findOne(id, user);
    item.activo = false;
    await this.repo.save(item);
    return { message: `Proveedor de madera #${id} dado de baja.` };
  }
}
