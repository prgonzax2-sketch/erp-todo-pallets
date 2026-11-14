import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Empleado } from '../../empleados/entities/empleado.entity.js';

@Entity('adelantos')
export class Adelanto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('decimal', { precision: 10, scale: 2 })
  monto: number;

  @Column('decimal', { precision: 10, scale: 2 })
  montoEntregado: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  metodoPago: string;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @CreateDateColumn()
  fecha: Date;

  @ManyToOne(() => Empleado)
  @JoinColumn({ name: 'empleadoId' })
  empleado: Empleado;
}