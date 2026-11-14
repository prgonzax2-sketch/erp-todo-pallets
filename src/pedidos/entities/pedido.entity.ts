import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('pedidos')
export class Pedido {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  numeroPedido: string;

  @Column({ type: 'varchar', length: 20 })
  fecha: string;

  @Column({ nullable: true })
  clienteId?: number;

  @Column({ type: 'varchar' })
  clienteNombre: string;

  @Column({ type: 'varchar', nullable: true })
  clienteCuitDni?: string;

  @Column({ type: 'varchar', nullable: true })
  clienteTelefono?: string;

  @Column({ type: 'varchar', nullable: true })
  clienteDireccion?: string;

  @Column({ type: 'varchar' })
  aserradero: string;

  @Column({ type: 'varchar', default: 'BORRADOR' })
  estado: string;

  @Column('float', { default: 0 })
  cantidadSolicitadaTotal: number;

  @Column('float', { default: 0 })
  totalP2Solicitado: number;

  @Column('float', { nullable: true })
  kgEstimados?: number | null;

  @Column({ type: 'varchar', nullable: true })
  medidaResumen?: string;

  @Column({ type: 'text', nullable: true })
  observaciones?: string;

  @Column({ type: 'varchar', nullable: true })
  remitoFisicoNumero?: string;

  @Column({ type: 'int', nullable: true })
  salidaStockId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  creadoPor?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
