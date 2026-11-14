import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity.js';
import { CreateClienteDto, UpdateClienteDto } from './dto/cliente.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,
  ) {}

  async findAll(user: AuthenticatedUser) {
    this.validarPermiso(user);
    const aserradero = user.aserradero;
    const query = this.clienteRepository.createQueryBuilder('cliente')
      .where('cliente.activo = :activo', { activo: true });

    if (aserradero) {
      query.andWhere('(cliente.aserradero = :aserradero OR cliente.aserradero IS NULL)', { aserradero });
    }

    query.orderBy('cliente.nombre', 'ASC');
    return query.getMany();
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarPermiso(user);
    const cliente = await this.clienteRepository.findOneBy({ id, activo: true });
    if (!cliente) throw new NotFoundException(`Cliente #${id} no encontrado.`);
    return cliente;
  }

  async create(dto: CreateClienteDto, user: AuthenticatedUser) {
    this.validarPermiso(user);
    const nombre = dto.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre del cliente es obligatorio.');

    const aserradero = user.aserradero || dto.aserradero?.trim() || undefined;

    const cliente = this.clienteRepository.create({
      nombre,
      cuitDni: dto.cuitDni?.trim() || undefined,
      telefono: dto.telefono?.trim() || undefined,
      direccion: dto.direccion?.trim() || undefined,
      aserradero,
      activo: true,
    });

    return this.clienteRepository.save(cliente);
  }

  async update(id: number, dto: UpdateClienteDto, user: AuthenticatedUser) {
    this.validarPermiso(user);
    const cliente = await this.findOne(id, user);
    if (dto.nombre !== undefined) cliente.nombre = dto.nombre.trim();
    if (dto.cuitDni !== undefined) cliente.cuitDni = dto.cuitDni.trim();
    if (dto.telefono !== undefined) cliente.telefono = dto.telefono.trim();
    if (dto.direccion !== undefined) cliente.direccion = dto.direccion.trim();
    if (dto.activo !== undefined) cliente.activo = dto.activo;

    return this.clienteRepository.save(cliente);
  }

  async remove(id: number, user: AuthenticatedUser) {
    this.validarPermiso(user);
    const cliente = await this.findOne(id, user);
    cliente.activo = false;
    await this.clienteRepository.save(cliente);
    return { message: `Cliente #${id} dado de baja exitosamente.` };
  }

  private validarPermiso(user: AuthenticatedUser) {
    if (user.rol !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden gestionar clientes.');
    }
  }
}

