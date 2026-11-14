import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Empleado } from '../../empleados/entities/empleado.entity.js';

@Entity('liquidaciones')
export class Liquidacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('decimal', { precision: 10, scale: 2 })
  totalGenerado: number; // La suma de todos los trabajos del Parte Diario

  @Column('decimal', { precision: 10, scale: 2 })
  saldoDescontado: number; // Lo que debía por los Adelantos (saldoPendiente)

  @Column('decimal', { precision: 10, scale: 2 })
  totalPagado: number; // El monto final real que le pones en la mano

  @CreateDateColumn()
  fechaLiquidacion: Date;

  // Conectamos esta liquidación con el empleado correspondiente
  @ManyToOne(() => Empleado)
  @JoinColumn({ name: 'empleadoId' })
  empleado: Empleado;
}
