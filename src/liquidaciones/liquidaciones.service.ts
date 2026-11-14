import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateLiquidacionDto } from './dto/create-liquidacion.dto.js';
import { UpdateLiquidacionDto } from './dto/update-liquidacion.dto.js';
import { Liquidacion } from './entities/liquidacion.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { ParteDiario } from '../partes-diarios/entities/parte-diario.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Injectable()
export class LiquidacionesService {
  constructor(
    @InjectRepository(Liquidacion) private liquidacionRepository: Repository<Liquidacion>,
    @InjectRepository(Empleado) private empleadoRepository: Repository<Empleado>,
    @InjectRepository(ParteDiario) private parteDiarioRepository: Repository<ParteDiario>,
  ) {}

  async create(createLiquidacionDto: CreateLiquidacionDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const empleado = await this.empleadoRepository.findOneBy({ id: createLiquidacionDto.empleadoId });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) {
      throw new NotFoundException(`El empleado #${createLiquidacionDto.empleadoId} no existe`);
    }

    const partesPendientes = await this.parteDiarioRepository.find({
      where: { 
        empleado: { id: empleado.id },
        liquidado: false 
      }
    });

    if (partesPendientes.length === 0) {
      throw new BadRequestException('Este empleado no tiene trabajos pendientes de cobro para liquidar.');
    }

    let totalGenerado = 0;
    for (const parte of partesPendientes) {
      const pagoHoras = Number(parte.horasTrabajadas) * Number(parte.precioPorHora);
      const pagoPallets = Number(parte.palletsFabricados) * Number(parte.precioPorPallet);
      const pagoLimpieza = Number(parte.turnosLimpieza) * Number(parte.precioPorLimpieza);
      const pagoCamiones = Number(parte.camionesCargados) * Number(parte.precioPorCamion);
      const pagoExtra = Number(parte.montoExtra);
      
      totalGenerado += (pagoHoras + pagoPallets + pagoLimpieza + pagoCamiones + pagoExtra);
    }

    const saldoActual = Number(empleado.saldoPendiente) || 0;
    const totalCalculado = totalGenerado + saldoActual; 

    let montoFisicoEntregado = totalCalculado;
    if (createLiquidacionDto.montoEntregado !== undefined) {
      montoFisicoEntregado = Number(createLiquidacionDto.montoEntregado);
    }

    const nuevoSaldo = totalCalculado - montoFisicoEntregado;

    const nuevaLiquidacion = this.liquidacionRepository.create({
      totalGenerado: totalGenerado,
      saldoDescontado: saldoActual,
      totalPagado: montoFisicoEntregado,
      empleado: empleado,
    });
    await this.liquidacionRepository.save(nuevaLiquidacion);

    for (const parte of partesPendientes) {
      parte.liquidado = true;
      await this.parteDiarioRepository.save(parte);
    }

    // FORZAMOS LA ACTUALIZACIÓN DIRECTA EN LA BASE DE DATOS PARA EVITAR PROBLEMAS DE CACHÉ DE TYPEORM
    await this.empleadoRepository.update(empleado.id, {
      saldoPendiente: nuevoSaldo
    });

    // Devolvemos el empleado actualizado en la respuesta para verificarlo visualmente
    empleado.saldoPendiente = nuevoSaldo;
    nuevaLiquidacion.empleado = empleado;

    return nuevaLiquidacion;
  }

  async findAll(user: AuthenticatedUser) {
    this.validarAdmin(user);
    return this.liquidacionRepository.find({
      relations: { empleado: true },
      where: user.aserradero ? { empleado: { aserradero: user.aserradero } } : {},
    });
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const liquidacion = await this.liquidacionRepository.findOne({ where: { id }, relations: { empleado: true } });
    if (!liquidacion || (user.aserradero && liquidacion.empleado.aserradero !== user.aserradero)) throw new NotFoundException(`La liquidación #${id} no existe.`);
    return liquidacion;
  }

  async update(id: number, updateLiquidacionDto: UpdateLiquidacionDto, user: AuthenticatedUser) {
    await this.findOne(id, user);
    return { mensaje: 'Por seguridad financiera, un recibo liquidado no se puede modificar directamente.' };
  }

  async remove(id: number, user: AuthenticatedUser) {
    await this.findOne(id, user);
    await this.liquidacionRepository.delete(id);
    return { mensaje: `La liquidación #${id} ha sido eliminada.` };
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar liquidaciones.');
  }
}
