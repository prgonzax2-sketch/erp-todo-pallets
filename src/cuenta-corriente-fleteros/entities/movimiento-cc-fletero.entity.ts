import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MovimientoCcFleteroTipo =
  | 'credito_viaje'
  | 'debito_pago'
  | 'debito_adelanto'
  | 'debito_combustible'
  | 'debito_transferencia'
  | 'ajuste';

@Entity('movimientos_cc_fletero')
export class MovimientoCcFletero {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  fleteroId: number;

  @Column({ type: 'varchar', length: 40 })
  tipo: MovimientoCcFleteroTipo;

  @Column('float')
  monto: number;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  fecha: string;

  @Column({ type: 'varchar', length: 250, nullable: true })
  concepto?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  medio?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  referencia?: string | null;

  @Column({ type: 'text', nullable: true })
  observacion?: string | null;

  @Index({ unique: true, where: '"ingresoRolloId" IS NOT NULL' })
  @Column({ type: 'int', nullable: true })
  ingresoRolloId?: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
