import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { SalidaStockDetalle } from './salida-stock-detalle.entity.js';

@Entity('salidas_stock')
export class SalidaStock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  numeroRemito: string;

  @Column({ type: 'varchar', length: 20 })
  fecha: string;

  @Column({ type: 'varchar', length: 120 })
  aserradero: string;

  @Column({ type: 'int', nullable: true })
  clienteId: number | null;

  @Column({ type: 'varchar', length: 200 })
  clienteNombre: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  clienteCuitDni: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  clienteTelefono: string | null;

  @Column({ type: 'varchar', length: 250, nullable: true })
  clienteDireccion: string | null;

  @Column({ type: 'float', default: 0 })
  cantidadSolicitada: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  medidaSolicitada: string | null;

  @Column({ type: 'float', default: 0 })
  totalPaquetesDespachados: number;

  @Column({ type: 'float', default: 0 })
  totalPiezasDespachadas: number;

  /** P2 físico despachado (legacy/compat). */
  @Column({ type: 'float', default: 0 })
  totalP2Despachado: number;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;

  /** @deprecated compat legacy: preferir `detalles` normalizados. Dual-write/lectura. */
  @Column('jsonb', { default: () => "'[]'" })
  items: any[];

  @Column({ type: 'varchar', length: 30, default: 'CONFIRMADA' })
  estado: string; // CONFIRMADA | ANULADA (legacy)

  @Column({ type: 'varchar', length: 150, nullable: true })
  creadoPor: string | null;

  // ===== A1 ventas/despacho (nullable/defaults seguros, retrocompat) =====
  @Column('int', { nullable: true }) pedidoId?: number | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) remitoFisicoNumero?: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) tipoComprobante?: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) facturaNumero?: string | null;
  @Column({ type: 'varchar', length: 30, default: 'SIN_FACTURA' }) estadoFacturacion: string; // SIN_FACTURA|FACTURADO|FACTURADO_PARCIAL
  @Column({ type: 'varchar', length: 200, nullable: true }) transporte?: string | null;
  @Column({ type: 'varchar', length: 40, default: 'LEGACY' }) origenTipo: string; // LEGACY|PEDIDO|DIRECTA_MADERA|DIRECTA_SUBPRODUCTO
  @Column({ type: 'varchar', length: 40, default: 'CONFIRMADO' }) estadoDespacho: string; // EMITIDO|PENDIENTE_BASCULA|CONFIRMADO|ANULADO
  @Column({ type: 'varchar', length: 10, default: 'ARS' }) moneda: string;
  @Column('float', { default: 0 }) subtotalNeto: number;
  @Column('float', { default: 0 }) ivaMonto: number;
  @Column('float', { default: 0 }) total: number;
  @Column('float', { nullable: true }) toneladasTotal?: number | null;
  @Column('float', { nullable: true }) m2Total?: number | null;
  @Column({ type: 'boolean', default: false }) basculaPendiente: boolean;
  @Column({ type: 'timestamp', nullable: true }) basculaConfirmadaAt?: Date | null;
  @Column({ type: 'timestamp', nullable: true }) facturadoAt?: Date | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) anuladoMotivo?: string | null;
  @Column({ type: 'timestamp', nullable: true }) anuladoAt?: Date | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) usuario?: string | null;

  @OneToMany('SalidaStockDetalle', 'salidaStock')
  detalles?: SalidaStockDetalle[];

  @CreateDateColumn()
  creadoEn: Date;
}