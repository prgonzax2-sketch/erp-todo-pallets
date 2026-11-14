import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Aserradero } from '../../aserraderos/entities/aserradero.entity.js';
import { Area } from '../../areas/entities/area.entity.js';
import { Proveedor } from '../../proveedores/entities/proveedor.entity.js';
import type { GastoLinea } from './gasto-linea.entity.js';

const decimalTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | number | null): number | null =>
    value == null ? null : Number(value),
};

@Entity('gastos_comprobantes')
@Index('IDX_gastos_comprobantes_aserradero_fecha', ['aserraderoId', 'fecha'])
@Index('IDX_gastos_comprobantes_area_fecha', ['areaId', 'fecha'])
@Index('IDX_gastos_comprobantes_proveedor', ['proveedorId'])
@Index('IDX_gastos_comprobantes_estado', ['estado'])
@Index('IDX_gastos_comprobantes_mes_anio', ['mes', 'anio'])
@Index('IDX_gastos_comprobantes_tipo', ['tipoComprobante'])
export class GastoComprobante {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'aserradero_id' })
  aserraderoId: number;

  @ManyToOne(() => Aserradero, { nullable: false })
  @JoinColumn({ name: 'aserradero_id' })
  aserradero: Aserradero;

  @Column({ type: 'varchar', length: 120, name: 'aserradero_nombre' })
  aserraderoNombre: string;

  @Column({ type: 'int', name: 'area_id' })
  areaId: number;

  @ManyToOne(() => Area, { nullable: false })
  @JoinColumn({ name: 'area_id' })
  area: Area;

  @Column({ type: 'varchar', length: 120, name: 'area_nombre' })
  areaNombre: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'int' })
  mes: number;

  @Column({ type: 'int' })
  anio: number;

  @Column({ type: 'int', name: 'proveedor_id', nullable: true })
  proveedorId?: number | null;

  @ManyToOne(() => Proveedor, { nullable: true })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Proveedor | null;

  @Column({ type: 'varchar', length: 200, name: 'proveedor_nombre', nullable: true })
  proveedorNombre?: string | null;

  @Column({ type: 'varchar', length: 20, name: 'tipo_comprobante' })
  tipoComprobante: string;

  @Column({ type: 'varchar', length: 10, name: 'punto_venta', nullable: true })
  puntoVenta?: string | null;

  @Column({ type: 'varchar', length: 30, name: 'numero_comprobante', nullable: true })
  numeroComprobante?: string | null;

  @Column({ type: 'varchar', length: 120 })
  responsable: string;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado: string;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  moneda: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'subtotal_neto', default: 0, transformer: decimalTransformer })
  subtotalNeto: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'iva_alicuota', default: 0, transformer: decimalTransformer })
  ivaAlicuota: number;

  @Column({ type: 'boolean', name: 'iva_exento', default: false })
  ivaExento: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'iva_monto', default: 0, transformer: decimalTransformer })
  ivaMonto: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'otros_tributos', default: 0, transformer: decimalTransformer })
  otrosTributos: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  total: number;

  @Column({ type: 'text', nullable: true })
  observaciones?: string | null;

  @Column({ type: 'int', name: 'creado_por_usuario_id', nullable: true })
  creadoPorUsuarioId?: number | null;

  @Column({ type: 'varchar', length: 160, name: 'creado_por', nullable: true })
  creadoPor?: string | null;

  @Column({ type: 'timestamp', name: 'confirmado_at', nullable: true })
  confirmadoAt?: Date | null;

  @Column({ type: 'varchar', length: 160, name: 'confirmado_por', nullable: true })
  confirmadoPor?: string | null;

  @Column({ type: 'timestamp', name: 'anulado_at', nullable: true })
  anuladoAt?: Date | null;

  @Column({ type: 'varchar', length: 160, name: 'anulado_por', nullable: true })
  anuladoPor?: string | null;

  @Column({ type: 'text', name: 'anulado_motivo', nullable: true })
  anuladoMotivo?: string | null;

  @OneToMany('GastoLinea', (l: any) => l.gastoComprobante, { cascade: false })
  lineas: Relation<GastoLinea[]>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
