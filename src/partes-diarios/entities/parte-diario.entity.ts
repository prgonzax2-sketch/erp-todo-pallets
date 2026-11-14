import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Empleado } from '../../empleados/entities/empleado.entity.js';

@Entity('partes_diarios')
export class ParteDiario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  fecha: string; // El día exacto al que corresponde este trabajo

  // --- 1. HORAS ---
  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  horasTrabajadas: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  precioPorHora: number; // Se congela el precio del día

  // --- 2. PALLETS ---
  @Column('int', { default: 0 })
  palletsFabricados: number; // Esto alimentará tu stock real

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  precioPorPallet: number;

  // --- 3. LIMPIEZA ---
  @Column('int', { default: 0 })
  turnosLimpieza: number; // Ej: 1 turno

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  precioPorLimpieza: number;

  // --- 4. CARGA DE CAMIONES ---
  @Column('int', { default: 0 })
  camionesCargados: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  precioPorCamion: number;

  // --- 5. EXTRAS / FUERA DE HORA ---
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  montoExtra: number;

  @Column({ type: 'text', nullable: true })
  detalleExtra: string; // Ej: "Mantenimiento de sierra"

  // --- EL INTERRUPTOR DE CIERRE ---
  // false = Pendiente de cobro. true = Ya se le pagó en un Cierre.
  @Column({ type: 'boolean', default: false })
  liquidado: boolean; 

  @CreateDateColumn()
  fechaRegistro: Date;

  // Conexión con el empleado
  @ManyToOne(() => Empleado)
  @JoinColumn({ name: 'empleadoId' })
  empleado: Empleado;
}