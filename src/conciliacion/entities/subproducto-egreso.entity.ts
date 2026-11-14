import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type SubproductoTipo = 'ASERRIN' | 'CHIP';
export type SubproductoEspecie = 'PINO' | 'EUCALIPTO' | 'MEZCLA' | 'OTRO';
export type SubproductoEstado = 'ESTIMADO' | 'CONFIRMADO' | 'AJUSTADO';

@Entity('subproductos_egresos')
export class SubproductoEgreso {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  aserradero: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  tipo: SubproductoTipo;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  fecha: string; // YYYY-MM-DD

  @Column({ type: 'varchar', length: 30, default: 'MEZCLA' })
  especieDeclarada: SubproductoEspecie;

  @Column('float')
  tnEstimadas: number;

  @Column('float', { nullable: true })
  tnReales?: number | null;

  @Column('float', { nullable: true })
  precioPorTn?: number | null;

  @Column({ type: 'varchar', length: 20, default: 'ESTIMADO' })
  estado: SubproductoEstado;

  @Column({ type: 'varchar', length: 120, nullable: true })
  referencia?: string | null; // remito/carga

  @Column({ type: 'text', nullable: true })
  observaciones?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  usuario?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
