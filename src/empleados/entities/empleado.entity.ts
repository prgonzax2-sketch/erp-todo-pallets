import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('empleados')
export class Empleado {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150 })
  nombreCompleto: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  documento: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  cuil: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefonoPersonal: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefonoEmergencia: string;

  @Column({ type: 'boolean', default: false })
  estaEnBlanco: boolean;

  @Column({ type: 'boolean', default: false })
  tieneSeguro: boolean;

  @Column({ type: 'varchar', length: 100, default: 'Operario' })
  puesto: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero: string | null;

  @Column({ type: 'varchar', length: 50, default: 'OPERARIO' }) 
  categoriaProduccion: string; 

  @Column({ type: 'varchar', length: 20, default: 'POR_HORA' })
  tipoSalario: string; 

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  sueldoFijo: number; 

  @Column({ type: 'varchar', length: 30, default: 'LUNES_VIERNES' })
  jornadaLaboral: string;

  @Column({ type: 'jsonb', nullable: true })
  diasPersonalizados: Record<string, number> | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  precioPorHora: number; 

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  saldoPendiente: number; 

  @Column({ type: 'boolean', default: true })
  estaActivo: boolean;

  // --- NUEVAS COLUMNAS DE LÍNEA DE TIEMPO ---
  @Column({ type: 'date', nullable: true })
  fechaIngreso: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  turnoIngreso: string;

  @Column({ type: 'date', nullable: true })
  fechaBaja: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  turnoBaja: string;

  @CreateDateColumn()
  fechaCreacion: Date;

  @UpdateDateColumn()
  fechaActualizacion: Date;
}
