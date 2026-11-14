import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SalidaStock } from './salida-stock.entity.js';

@Entity('salida_stock_detalles')
export class SalidaStockDetalle {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column('int')
  salidaStockId: number;

  @ManyToOne(() => SalidaStock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salidaStockId' })
  salidaStock: SalidaStock;

  @Column({ type: 'varchar', length: 30, default: 'MADERA_PAQUETE' })
  tipoRenglon: string; // MADERA_PAQUETE | SUBPRODUCTO | OTRO

  @Index()
  @Column('int', { nullable: true })
  produccionId?: number | null;

  @Index()
  @Column('int', { nullable: true })
  pedidoAsignacionId?: number | null;

  @Column('int', { nullable: true })
  subproductoEgresoId?: number | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  productoTipo?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  productoEspecie?: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  detalle?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  medidaTexto?: string | null;

  @Column('float', { nullable: true }) espesorSolicitado?: number | null;
  @Column('float', { nullable: true }) anchoSolicitado?: number | null;
  @Column('float', { nullable: true }) largoSolicitado?: number | null;
  @Column('float', { nullable: true }) espesorReal?: number | null;
  @Column('float', { nullable: true }) anchoReal?: number | null;
  @Column('float', { nullable: true }) largoReal?: number | null;
  @Column({ type: 'boolean', default: false }) difiereMedida: boolean;

  @Column('float', { default: 0 }) cantidad: number; // paquetes o unidades
  @Column('float', { nullable: true }) piezas?: number | null;
  @Column('float', { default: 0 }) p2: number;
  @Column('float', { nullable: true }) m2?: number | null;
  @Column('float', { nullable: true }) toneladas?: number | null;
  @Column('float', { nullable: true }) tnProvisionales?: number | null;
  @Column('float', { nullable: true }) tnReales?: number | null;

  @Column({ type: 'varchar', length: 20, default: 'P2' })
  unidadPrecio: string; // P2 | TN | M2 | UNIDAD

  @Column('float', { default: 0 }) precioUnitario: number;
  @Column('float', { default: 0 }) cantidadBase: number;
  @Column('float', { default: 0 }) importeNeto: number;
  @Column('float', { default: 21 }) alicuotaIva: number;
  @Column('float', { default: 0 }) ivaMonto: number;
  @Column('float', { default: 0 }) total: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  estadoLinea?: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones?: string | null;
}