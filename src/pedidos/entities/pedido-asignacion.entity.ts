import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Pedido } from './pedido.entity.js';
import { PedidoItem } from './pedido-item.entity.js';

@Entity('pedido_asignaciones')
export class PedidoAsignacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column('int')
  pedidoId: number;

  @ManyToOne(() => Pedido, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedidoId' })
  pedido: Pedido;

  @Index()
  @Column('int')
  pedidoItemId: number;

  @ManyToOne(() => PedidoItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedidoItemId' })
  pedidoItem: PedidoItem;

  @Index()
  @Column('int')
  produccionId: number;

  @Column({ type: 'varchar', nullable: true })
  aserraderoOrigen?: string;

  @Column({ type: 'varchar', nullable: true })
  aserraderoGestion?: string;

  @Column('float')
  paquetesAsignados: number;

  @Column('float', { default: 0 })
  piezasPorPaquete: number;

  @Column('float', { default: 0 })
  tablasAsignadas: number;

  @Column('float')
  medidaSolicitadaEsp: number;

  @Column('float')
  medidaSolicitadaAnc: number;

  @Column('float')
  medidaSolicitadaLar: number;

  @Column('float')
  medidaRealEsp: number;

  @Column('float')
  medidaRealAnc: number;

  @Column('float')
  medidaRealLar: number;

  @Column({ type: 'varchar', default: 'MM' })
  unidadDimensionesReal: string;

  @Column({ type: 'boolean', default: false })
  difiereMedida: boolean;

  @Column('float', { default: 1 })
  toleranciaMm: number;

  @Column('float', { default: 0 })
  p2Solicitado: number;

  @Column('float', { nullable: true })
  p2Real?: number | null;

  @Column('jsonb', { default: [] })
  separadoresSnapshot: any[];

  @Column('jsonb', { default: [] })
  tacosSnapshot: any[];

  @Column({ type: 'varchar', default: 'RESERVADA' })
  estado: string; // RESERVADA, LIBERADA, RETIRADA, DESPACHADA, SOLICITADA_INTER, AUTORIZADA_INTER, RECHAZADA_INTER, PENDIENTE_RETIRO_INTER

  // V2 despacho refs (nullable, compat)
  @Column('int', { nullable: true })
  salidaStockId?: number | null;

  @Column('int', { nullable: true })
  salidaDetalleId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  solicitadoPor?: string;

  @Column({ type: 'varchar', nullable: true })
  autorizadoPor?: string;

  @Column({ type: 'varchar', nullable: true })
  retiradoPor?: string;

  @Column({ type: 'varchar', nullable: true })
  fechaSolicitud?: string;

  @Column({ type: 'varchar', nullable: true })
  fechaAutorizacion?: string;

  @Column({ type: 'varchar', nullable: true })
  fechaRetiro?: string;

  @Column({ type: 'text', nullable: true })
  motivoRechazo?: string;

  @Column({ type: 'text', nullable: true })
  observaciones?: string;
}
