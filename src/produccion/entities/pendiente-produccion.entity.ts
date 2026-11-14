import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pendientes_produccion')
export class PendienteProduccion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  clienteNombre: string;

  @Column({ type: 'int', nullable: true })
  clienteId: number;

  @Column({ type: 'varchar', length: 20 })
  fecha: string;

  @Column({ type: 'varchar', length: 120 })
  aserradero: string;

  @Column({ type: 'varchar', length: 100 })
  especie: string;

  @Column({ type: 'float' })
  espesor: number;

  @Column({ type: 'float' })
  ancho: number;

  @Column({ type: 'float' })
  largo: number;

  @Column({ type: 'varchar', length: 30, default: 'MM' })
  unidadDimensiones: string;

  @Column({ type: 'float' })
  cantidadRequerida: number;

  @Column({ type: 'float', default: 0 })
  cantidadProducida: number;

  @Column({ type: 'float', default: 0 })
  p2Estimado: number;

  @Column({ type: 'varchar', length: 40, default: 'PENDIENTE' })
  estado: string;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  creadoPor: string;

  @CreateDateColumn()
  creadoEn: Date;
}

