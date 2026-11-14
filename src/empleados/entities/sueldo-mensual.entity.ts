import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { Empleado } from './empleado.entity.js';

@Entity('sueldos_mensuales')
@Unique(['empleado', 'anio', 'mes'])
export class SueldoMensual {
  @ManyToOne(() => Empleado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empleadoId' })
  empleado: Empleado;

  @Column({ primary: true })
  empleadoId: number;

  @Column({ primary: true })
  anio: number;

  @Column({ primary: true })
  mes: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  sueldoAsignado: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  sueldoAcreditado: number;

  @Column('decimal', { precision: 8, scale: 4, default: 1 })
  factorProrrateo: number;

  @CreateDateColumn()
  fechaCreacion: Date;
}