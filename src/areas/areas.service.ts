import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { CreateAreaDto } from './dto/create-area.dto.js';
import { UpdateAreaDto } from './dto/update-area.dto.js';
import { Area } from './entities/area.entity.js';

export type AreaQuery = {
  aserraderoId?: number;
  aserradero?: string;
};

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area) private readonly repo: Repository<Area>,
    @InjectRepository(Aserradero)
    private readonly aserraderosRepo: Repository<Aserradero>,
  ) {}

  private esAdminAsignado(user: AuthenticatedUser): boolean {
    return user.rol === 'admin' && !!user.aserradero?.trim();
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden acceder a áreas.');
    }
  }

  private validarAdminGeneral(user: AuthenticatedUser) {
    this.validarAdmin(user);
    if (this.esAdminAsignado(user)) {
      throw new ForbiddenException(
        'Solo un administrador general puede modificar áreas.',
      );
    }
  }

  private normalizarNombre(nombre?: string): string {
    const value = nombre?.trim();
    if (!value) throw new BadRequestException('El nombre es obligatorio.');
    return value;
  }

  private async resolverAserraderoIdPorNombre(nombre: string): Promise<number> {
    const normalizado = nombre.trim();
    const aserradero = await this.aserraderosRepo
      .createQueryBuilder('a')
      .where('LOWER(TRIM(a.nombre)) = LOWER(:nombre)', { nombre: normalizado })
      .andWhere('a.activo = true')
      .getOne();
    if (!aserradero) {
      throw new BadRequestException(
        `El aserradero "${normalizado}" no existe o está inactivo.`,
      );
    }
    return aserradero.id;
  }

  private async resolverAserraderoId(
    user: AuthenticatedUser,
    query: AreaQuery = {},
  ): Promise<number | undefined> {
    if (this.esAdminAsignado(user)) {
      return this.resolverAserraderoIdPorNombre(user.aserradero as string);
    }
    if (query.aserraderoId !== undefined && !Number.isNaN(query.aserraderoId)) {
      return query.aserraderoId;
    }
    if (query.aserradero?.trim()) {
      return this.resolverAserraderoIdPorNombre(query.aserradero);
    }
    return undefined;
  }

  private async assertNombreUnico(
    aserraderoId: number,
    nombre: string,
    excludeId?: number,
  ) {
    const items = await this.repo.find({
      where: { aserraderoId },
      select: { id: true, nombre: true },
    });
    const key = nombre.trim().toLowerCase();
    const dup = items.find(
      (a) => a.id !== excludeId && a.nombre.trim().toLowerCase() === key,
    );
    if (dup) {
      throw new ConflictException(
        'Ya existe un área con ese nombre en el aserradero.',
      );
    }
  }

  private async assertAserraderoExiste(aserraderoId: number) {
    const aserradero = await this.aserraderosRepo.findOneBy({ id: aserraderoId });
    if (!aserradero || !aserradero.activo) {
      throw new BadRequestException(
        `El aserradero #${aserraderoId} no existe o está inactivo.`,
      );
    }
  }

  async findAll(user: AuthenticatedUser, query: AreaQuery = {}) {
    this.validarAdmin(user);
    const forcedAserraderoId = await this.resolverAserraderoId(user, query);
    const where: FindOptionsWhere<Area> = {};
    if (forcedAserraderoId !== undefined) where.aserraderoId = forcedAserraderoId;
    return this.repo.find({
      where,
      relations: { aserradero: true },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const item = await this.repo.findOne({
      where: { id },
      relations: { aserradero: true },
    });
    if (!item) throw new NotFoundException(`Área #${id} no encontrada.`);
    if (this.esAdminAsignado(user)) {
      const ownId = await this.resolverAserraderoIdPorNombre(user.aserradero as string);
      if (item.aserraderoId !== ownId) {
        throw new ForbiddenException('No tiene acceso a áreas de otro aserradero.');
      }
    }
    return item;
  }

  async create(dto: CreateAreaDto, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    await this.assertAserraderoExiste(dto.aserraderoId);
    const nombre = this.normalizarNombre(dto.nombre);
    await this.assertNombreUnico(dto.aserraderoId, nombre);
    return this.repo.save(
      this.repo.create({
        aserraderoId: dto.aserraderoId,
        nombre,
        activo: dto.activo ?? true,
      }),
    );
  }

  async update(id: number, dto: UpdateAreaDto, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException(`Área #${id} no encontrada.`);
    if (dto.nombre !== undefined) {
      const nombre = this.normalizarNombre(dto.nombre);
      await this.assertNombreUnico(item.aserraderoId, nombre, id);
      item.nombre = nombre;
    }
    if (dto.activo !== undefined) item.activo = dto.activo;
    return this.repo.save(item);
  }

  async remove(id: number, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException(`Área #${id} no encontrada.`);
    item.activo = false;
    await this.repo.save(item);
    return { message: `Área #${id} dada de baja.` };
  }
}
