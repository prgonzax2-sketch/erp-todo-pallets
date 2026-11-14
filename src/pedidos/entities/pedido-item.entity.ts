import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Pedido } from './pedido.entity.js';

@Entity('pedido_items')
export class PedidoItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column('int')
  pedidoId: number;

  @ManyToOne(() => Pedido, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedidoId' })
  pedido: Pedido;

  @Column({ type: 'varchar', nullable: true })
  especie?: string;

  /** D-SP1: MADERA (default, compat) | SUBPRODUCTO (Chip/Aserrín). */
  @Column({ type: 'varchar', default: 'MADERA' })
  tipoProducto: string;

  /** D-SP1: ASERRIN | CHIP cuando tipoProducto=SUBPRODUCTO. */
  @Column({ type: 'varchar', nullable: true })
  subproductoTipo?: string | null;

  /** D-SP1: TN estimadas (SUBPRODUCTO). No inventa P2/kg. */
  @Column('float', { nullable: true })
  tnEstimada?: number | null;

  @Column('float', { nullable: true })
  espesorSolicitado?: number | null;

  @Column('float', { nullable: true })
  anchoSolicitado?: number | null;

  @Column('float', { nullable: true })
  largoSolicitado?: number | null;

  @Column({ type: 'varchar', default: 'MM' })
  unidadDimensiones: string;

  @Column('float', { default: 0 })
  cantidadSolicitada: number;

  @Column('float', { default: 0 })
  cantidadAsignada: number;

  @Column('float', { default: 0 })
  cantidadFaltante: number;

  @Column('float', { default: 0 })
  p2SolicitadoEstimado: number;

  @Column({ type: 'varchar', default: 'PENDIENTE' })
  estado: string;

  @Column({ type: 'text', nullable: true })
  observaciones?: string;
}
