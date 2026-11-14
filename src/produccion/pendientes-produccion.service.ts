import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendienteProduccion } from './entities/pendiente-produccion.entity.js';
import { CreatePendienteProduccionDto, UpdatePendienteProduccionDto } from './dto/pendiente-produccion.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Injectable()
export class PendientesProduccionService {
  constructor(
    @InjectRepository(PendienteProduccion)
    private readonly pendienteRepository: Repository<PendienteProduccion>,
  ) {}

  async create(dto: CreatePendienteProduccionDto, user: AuthenticatedUser) {
    this.validarPermiso(user);
    const aserradero = user.aserradero ?? dto.aserradero?.trim();
    if (!aserradero) throw new ForbiddenException('Debes indicar el aserradero de la solicitud.');

    const p2Estimado = this.calcularP2({
      espesor: dto.espesor,
      ancho: dto.ancho,
      largo: dto.largo,
      cantidadRequerida: dto.cantidadRequerida,
    });

    const pendiente = this.pendienteRepository.create({
      clienteNombre: dto.clienteNombre?.trim(),
      clienteId: dto.clienteId,
      fecha: dto.fecha?.trim() || new Date().toISOString().slice(0, 10),
      aserradero,
      especie: dto.especie?.trim(),
      espesor: Number(dto.espesor),
      ancho: Number(dto.ancho),
      largo: Number(dto.largo),
      unidadDimensiones: dto.unidadDimensiones || 'MM',
      cantidadRequerida: Number(dto.cantidadRequerida),
      p2Estimado,
      observaciones: dto.observaciones?.trim() ?? undefined,
      creadoPor: user.email ?? user.rol,
    });

    return this.pendienteRepository.save(pendiente);
  }

  async findAll(user: AuthenticatedUser) {
    this.validarPermiso(user);
    const aserradero = user.aserradero;
    const query = this.pendienteRepository.createQueryBuilder('pendiente');
    if (aserradero) {
      query.andWhere('pendiente.aserradero = :aserradero', { aserradero });
    }
    query.orderBy('pendiente.creadoEn', 'DESC');
    return query.getMany();
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarPermiso(user);
    const pendiente = await this.pendienteRepository.findOneBy({ id });
    if (!pendiente) throw new NotFoundException(`Solicitud de producción #${id} no encontrada.`);
    if (user.aserradero && pendiente.aserradero !== user.aserradero) {
      throw new ForbiddenException('No tienes acceso a esta solicitud de producción.');
    }
    return pendiente;
  }

  async update(id: number, dto: UpdatePendienteProduccionDto, user: AuthenticatedUser) {
    this.validarPermiso(user);
    const pendiente = await this.findOne(id, user);
    if (dto.estado !== undefined) pendiente.estado = dto.estado;
    if (dto.cantidadProducida !== undefined) pendiente.cantidadProducida = Number(dto.cantidadProducida);
    if (dto.aserradero !== undefined) {
      if (user.aserradero) throw new ForbiddenException('No puedes cambiar el aserradero de una solicitud.');
      pendiente.aserradero = dto.aserradero!.trim();
    }
    if (dto.observaciones !== undefined) pendiente.observaciones = dto.observaciones?.trim() || '';
    return this.pendienteRepository.save(pendiente);
  }

  async remove(id: number, user: AuthenticatedUser) {
    this.validarPermiso(user);
    const pendiente = await this.findOne(id, user);
    await this.pendienteRepository.remove(pendiente);
    return { message: `Solicitud de producción #${id} eliminada.` };
  }

  private calcularP2(data: { espesor: number; ancho: number; largo: number; cantidadRequerida: number }) {
    const { espesor, ancho, largo, cantidadRequerida } = data;
    if (!Number.isFinite(espesor) || !Number.isFinite(ancho) || !Number.isFinite(largo) || !Number.isFinite(cantidadRequerida)) {
      return 0;
    }
    return (cantidadRequerida * espesor * ancho * largo * 424) / 1000000000;
  }

  private validarPermiso(user: AuthenticatedUser) {
    if (user.rol !== 'admin') {
      throw new ForbiddenException('Solo los administradores pueden gestionar solicitudes de producción.');
    }
  }
}