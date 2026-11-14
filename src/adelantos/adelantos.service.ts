import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAdelantoDto } from './dto/create-adelanto.dto.js';
import { UpdateAdelantoDto } from './dto/update-adelanto.dto.js';
import { Adelanto } from './entities/adelanto.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Injectable()
export class AdelantosService {
  constructor(
    @InjectRepository(Adelanto) private adelantoRepository: Repository<Adelanto>,
    @InjectRepository(Empleado) private empleadoRepository: Repository<Empleado>,
  ) {}

  async create(createAdelantoDto: CreateAdelantoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const empleado = await this.empleadoRepository.findOneBy({ id: createAdelantoDto.empleadoId });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) {
      throw new NotFoundException(`El empleado #${createAdelantoDto.empleadoId} no existe`);
    }

    const diferencia = createAdelantoDto.monto - createAdelantoDto.montoEntregado;

    const saldoActual = Number(empleado.saldoPendiente) || 0;
    empleado.saldoPendiente = saldoActual + diferencia;
    
    await this.empleadoRepository.save(empleado);

    const nuevoAdelanto = this.adelantoRepository.create({
      monto: createAdelantoDto.monto,
      montoEntregado: createAdelantoDto.montoEntregado,
      metodoPago: createAdelantoDto.metodoPago,
      observaciones: createAdelantoDto.observaciones,
      empleado: empleado, 
    });

    return await this.adelantoRepository.save(nuevoAdelanto);
  }

  async findAll(user: AuthenticatedUser) {
    this.validarAdmin(user);
    return this.adelantoRepository.find({
      relations: { empleado: true },
      where: user.aserradero ? { empleado: { aserradero: user.aserradero } } : {},
    });
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const adelanto = await this.adelantoRepository.findOne({ where: { id }, relations: { empleado: true } });
    if (!adelanto || (user.aserradero && adelanto.empleado.aserradero !== user.aserradero)) throw new NotFoundException(`El adelanto #${id} no existe.`);
    return adelanto;
  }

  async update(id: number, updateAdelantoDto: UpdateAdelantoDto, user: AuthenticatedUser) {
    await this.findOne(id, user);
    if (updateAdelantoDto.empleadoId) await this.validarEmpleado(updateAdelantoDto.empleadoId, user);
    await this.adelantoRepository.update(id, updateAdelantoDto);
    return this.findOne(id, user);
  }

  async remove(id: number, user: AuthenticatedUser) {
    await this.findOne(id, user);
    await this.adelantoRepository.delete(id);
    return { mensaje: `El adelanto #${id} ha sido eliminado.` };
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar adelantos.');
  }

  private async validarEmpleado(id: number, user: AuthenticatedUser) {
    const empleado = await this.empleadoRepository.findOneBy({ id });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) throw new NotFoundException(`El empleado #${id} no existe en tu aserradero.`);
  }
}