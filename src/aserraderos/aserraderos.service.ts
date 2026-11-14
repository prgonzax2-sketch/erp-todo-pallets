import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Aserradero } from './entities/aserradero.entity.js';

@Injectable()
export class AserraderosService {
  constructor(@InjectRepository(Aserradero) private readonly repository: Repository<Aserradero>) {}

  async findAll(user: AuthenticatedUser) {
    this.validarAdmin(user);
    if (user.aserradero) return this.repository.find({ where: { nombre: user.aserradero, activo: true } });
    return this.repository.find({ where: { activo: true }, order: { nombre: 'ASC' } });
  }

  async create(nombre: string, user: AuthenticatedUser) {
    this.validarGeneral(user);
    const nombreNormalizado = nombre?.trim();
    if (!nombreNormalizado) throw new BadRequestException('El nombre del aserradero es obligatorio.');
    const existente = await this.repository.findOneBy({ nombre: nombreNormalizado });
    if (existente) {
      if (!existente.activo) {
        existente.activo = true;
        return this.repository.save(existente);
      }
      throw new ConflictException('Ya existe un aserradero con ese nombre.');
    }
    return this.repository.save(this.repository.create({ nombre: nombreNormalizado }));
  }

  async deactivate(id: number, user: AuthenticatedUser) {
    this.validarGeneral(user);
    const aserradero = await this.repository.findOneBy({ id });
    if (!aserradero) throw new NotFoundException(`El aserradero #${id} no existe.`);
    aserradero.activo = false;
    return this.repository.save(aserradero);
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden consultar aserraderos.');
  }

  private validarGeneral(user: AuthenticatedUser) {
    this.validarAdmin(user);
    if (user.aserradero) throw new ForbiddenException('Solo un administrador general puede administrar aserraderos.');
  }
}
