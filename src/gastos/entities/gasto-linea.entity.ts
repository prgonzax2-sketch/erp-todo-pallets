import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Rubro } from '../../rubros/entities/rubro.entity.js';
import type { GastoComprobante } from './gasto-comprobante.entity.js';

const decimalTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | number | null): number | null =>
    value == null ? null : Number(value),
};

@Entity('gastos_lineas')
@Index('IDX_gastos_lineas_comprobante', ['gastoComprobanteId'])
@Index('IDX_gastos_lineas_rubro', ['rubroId'])
export class GastoLinea {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'gasto_comprobante_id' })
  gastoComprobanteId: number;

  @ManyToOne('GastoComprobante', (g: any) => g.lineas, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'gasto_comprobante_id' })
  gastoComprobante: Relation<GastoComprobante>;

  @Column({ type: 'int', name: 'rubro_id' })
  rubroId: number;

  @ManyToOne(() => Rubro, { nullable: false })
  @JoinColumn({ name: 'rubro_id' })
  rubro: Rubro;

  @Column({ type: 'varchar', length: 120, name: 'rubro_nombre', nullable: true })
  rubroNombre?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0, transformer: decimalTransformer })
  cantidad: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'precio_unitario', default: 0, transformer: decimalTransformer })
  precioUnitario: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimalTransformer })
  neto: number;

  @Column({ type: 'int', default: 0 })
  orden: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
