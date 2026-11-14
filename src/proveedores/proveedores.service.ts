import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { normalizeCuit } from '../common/validators/cuit.js';
import { Rubro } from '../rubros/entities/rubro.entity.js';
import { CreateProveedorDto } from './dto/create-proveedor.dto.js';
import { UpdateProveedorDto } from './dto/update-proveedor.dto.js';
import { Proveedor } from './entities/proveedor.entity.js';

@Injectable()
export class ProveedoresService {
  constructor(
    @InjectRepository(Proveedor) private readonly repo: Repository<Proveedor>,
    @InjectRepository(Rubro) private readonly rubrosRepo: Repository<Rubro>,
  ) {}

  private esAdminAsignado(user: AuthenticatedUser): boolean {
    return user.rol === 'admin' && !!user.aserradero?.trim();
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') {
      throw new ForbiddenException(
        'Solo los administradores pueden acceder a proveedores.',
      );
    }
  }

  private validarAdminGeneral(user: AuthenticatedUser) {
    this.validarAdmin(user);
    if (this.esAdminAsignado(user)) {
      throw new ForbiddenException(
        'Solo un administrador general puede modificar proveedores.',
      );
    }
  }

  private normalizarTexto(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const v = String(value).trim();
    return v || null;
  }

  private async validarRubroHabitual(rubroHabitualId?: number | null) {
    if (rubroHabitualId === undefined || rubroHabitualId === null) return;
    const rubro = await this.rubrosRepo.findOneBy({ id: rubroHabitualId });
    if (!rubro) {
      throw new BadRequestException(
        `El rubro habitual #${rubroHabitualId} no existe.`,
      );
    }
  }

  async findAll(user: AuthenticatedUser) {
    this.validarAdmin(user);
    return this.repo.find({
      relations: { rubroHabitual: true },
      order: { razonSocial: 'ASC' },
    });
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const item = await this.repo.findOne({
      where: { id },
      relations: { rubroHabitual: true },
    });
    if (!item) throw new NotFoundException(`Proveedor #${id} no encontrado.`);
    return item;
  }

  async create(dto: CreateProveedorDto, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    const razonSocial = this.normalizarTexto(dto.razonSocial);
    if (!razonSocial) throw new BadRequestException('La razón social es obligatoria.');
    await this.validarRubroHabitual(dto.rubroHabitualId);
    const cuit = normalizeCuit(dto.cuit);
    return this.repo.save(
      this.repo.create({
        razonSocial,
        nombreFantasia: this.normalizarTexto(dto.nombreFantasia),
        cuit,
        rubroHabitualId: dto.rubroHabitualId ?? null,
        telefono: this.normalizarTexto(dto.telefono),
        email: this.normalizarTexto(dto.email),
        direccion: this.normalizarTexto(dto.direccion),
        activo: dto.activo ?? true,
      }),
    );
  }

  async update(id: number, dto: UpdateProveedorDto, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException(`Proveedor #${id} no encontrado.`);
    if (dto.razonSocial !== undefined) {
      const razonSocial = this.normalizarTexto(dto.razonSocial);
      if (!razonSocial) throw new BadRequestException('La razón social es obligatoria.');
      item.razonSocial = razonSocial;
    }
    if (dto.nombreFantasia !== undefined)
      item.nombreFantasia = this.normalizarTexto(dto.nombreFantasia);
    if (dto.cuit !== undefined) item.cuit = normalizeCuit(dto.cuit);
    if (dto.rubroHabitualId !== undefined) {
      await this.validarRubroHabitual(dto.rubroHabitualId);
      item.rubroHabitualId = dto.rubroHabitualId;
    }
    if (dto.telefono !== undefined) item.telefono = this.normalizarTexto(dto.telefono);
    if (dto.email !== undefined) item.email = this.normalizarTexto(dto.email);
    if (dto.direccion !== undefined) item.direccion = this.normalizarTexto(dto.direccion);
    if (dto.activo !== undefined) item.activo = dto.activo;
    return this.repo.save(item);
  }

  async remove(id: number, user: AuthenticatedUser) {
    this.validarAdminGeneral(user);
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException(`Proveedor #${id} no encontrado.`);
    item.activo = false;
    await this.repo.save(item);
    return { message: `Proveedor #${id} dado de baja.` };
  }
}
