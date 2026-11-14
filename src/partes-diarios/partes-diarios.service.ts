import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateParteDiarioDto } from './dto/create-parte-diario.dto.js';
import { UpdateParteDiarioDto } from './dto/update-parte-diario.dto.js';
import { ParteDiario } from './entities/parte-diario.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Injectable()
export class PartesDiariosService {
  constructor(
    @InjectRepository(ParteDiario) private parteDiarioRepository: Repository<ParteDiario>,
    @InjectRepository(Empleado) private empleadoRepository: Repository<Empleado>,
  ) {}

  async create(createParteDiarioDto: CreateParteDiarioDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const empleado = await this.empleadoRepository.findOneBy({ id: createParteDiarioDto.empleadoId });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) {
      throw new NotFoundException(`El empleado #${createParteDiarioDto.empleadoId} no existe`);
    }

    const parteDiario = this.parteDiarioRepository.create({
      ...createParteDiarioDto,
      empleado,
      // Si mandas precio en el DTO lo usa, si no usa el del empleado o 0
      precioPorHora: createParteDiarioDto.precioPorHora ?? empleado.precioPorHora ?? 0,
      precioPorPallet: createParteDiarioDto.precioPorPallet ?? 0,
      precioPorLimpieza: createParteDiarioDto.precioPorLimpieza ?? 0,
      precioPorCamion: createParteDiarioDto.precioPorCamion ?? 0,
    });

    return await this.parteDiarioRepository.save(parteDiario);
  }

  async findAll(user: AuthenticatedUser) {
    this.validarAdmin(user);
    return this.parteDiarioRepository.find({
      relations: { empleado: true },
      where: user.aserradero ? { empleado: { aserradero: user.aserradero } } : {},
    });
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const parte = await this.parteDiarioRepository.findOne({ where: { id }, relations: { empleado: true } });
    if (!parte || (user.aserradero && parte.empleado.aserradero !== user.aserradero)) throw new NotFoundException(`El parte diario #${id} no existe.`);
    return parte;
  }

  async update(id: number, updateParteDiarioDto: UpdateParteDiarioDto, user: AuthenticatedUser) {
    await this.findOne(id, user);
    if (updateParteDiarioDto.empleadoId) await this.validarEmpleado(updateParteDiarioDto.empleadoId, user);
    await this.parteDiarioRepository.update(id, updateParteDiarioDto);
    return this.findOne(id, user);
  }

  async remove(id: number, user: AuthenticatedUser) {
    await this.findOne(id, user);
    await this.parteDiarioRepository.delete(id);
    return { mensaje: `El parte diario #${id} ha sido eliminado.` };
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar partes diarios.');
  }

  private async validarEmpleado(id: number, user: AuthenticatedUser) {
    const empleado = await this.empleadoRepository.findOneBy({ id });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) throw new NotFoundException(`El empleado #${id} no existe en tu aserradero.`);
  }
}