import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ingresos_rollos')
@Unique('UQ_ingresos_rollos_proveedor_remito', ['proveedorMaderaId', 'nroRemito'])
export class IngresoRollo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  maderaId: number;

  @Index()
  @Column({ type: 'int' })
  proveedorMaderaId: number;

  @Column({ type: 'int', nullable: true })
  quintaId?: number | null;

  @Column({ type: 'int', nullable: true })
  plantacionId?: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  cargaDDD?: string | null;

  @Index()
  @Column({ type: 'int' })
  transporteId: number;

  @Index()
  @Column({ type: 'int' })
  fleteroId: number;

  @Column({ type: 'varchar', length: 100 })
  nroRemito: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  fecha: string;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  aserradero: string;

  @Column({ type: 'int', nullable: true })
  mes?: number | null;

  @Column({ type: 'int', nullable: true })
  anio?: number | null;

  @Column('float', { default: 0 })
  largoMetros: number;

  @Column('float', { default: 0 })
  m3: number;

  @Column('float', { default: 0 })
  toneladas: number;

  @Column('float', { default: 0 })
  precioTnMadera: number;

  @Column('float', { default: 0 })
  subtotalBruto: number;

  @Column('float', { default: 0 })
  iva: number;

  @Column('float', { default: 0 })
  totalMadera: number;

  @Column('float', { default: 0 })
  precioFleteTn: number;

  @Column('float', { default: 0 })
  subtotalFlete: number;

  @Column('float', { default: 0 })
  ajustesAdicionalesFlete: number;

  @Column('float', { default: 0 })
  totalFleteViaje: number;

  @Column('float', { nullable: true })
  stockCampoM3?: number | null;

  @Column('float', { nullable: true })
  stockCampoTN?: number | null;

  @Column('float', { nullable: true })
  utilizacionSemanalRollo?: number | null;

  @Column('float', { nullable: true })
  stockFinalCampo?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
