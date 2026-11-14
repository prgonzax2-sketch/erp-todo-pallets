import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Aserradero } from '../../aserraderos/entities/aserradero.entity.js';

@Entity('areas')
// Unicidad de negocio: (aserradero_id, lower(btrim(nombre))) vía SQL funcional + precheck servicio (evita TOCTOU/case variants).
@Index(['aserraderoId', 'nombre'])
export class Area {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'aserradero_id' })
  aserraderoId: number;

  @ManyToOne(() => Aserradero, { nullable: false })
  @JoinColumn({ name: 'aserradero_id' })
  aserradero: Aserradero;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  creadoEn: Date;

  @UpdateDateColumn()
  actualizadoEn: Date;
}
