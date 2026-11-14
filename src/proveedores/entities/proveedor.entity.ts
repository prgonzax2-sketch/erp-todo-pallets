import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Rubro } from '../../rubros/entities/rubro.entity.js';

@Entity('proveedores')
export class Proveedor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200, name: 'razon_social' })
  razonSocial: string;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'nombre_fantasia' })
  nombreFantasia?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cuit?: string | null;

  @Column({ type: 'int', nullable: true, name: 'rubro_habitual_id' })
  rubroHabitualId?: number | null;

  @ManyToOne(() => Rubro, { nullable: true })
  @JoinColumn({ name: 'rubro_habitual_id' })
  rubroHabitual?: Rubro | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  telefono?: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  direccion?: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  creadoEn: Date;

  @UpdateDateColumn()
  actualizadoEn: Date;
}
