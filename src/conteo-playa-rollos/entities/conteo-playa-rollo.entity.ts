import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ConteoPlayaRolloItem } from './conteo-playa-rollo-item.entity.js';

export type ConteoPlayaTipoPeriodo = 'semanal' | 'mensual' | 'libre';

@Entity('conteos_playa_rollo')
export class ConteoPlayaRollo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  aserradero: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  fechaCierre: string; // YYYY-MM-DD

  @Column({ type: 'varchar', length: 30, nullable: true })
  turno?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'libre' })
  tipoPeriodo: ConteoPlayaTipoPeriodo;

  @Column('float', { default: 0.7 })
  factorTnPlaya: number;

  @Column('float', { default: 0 })
  totalM3: number;

  @Column('float', { default: 0 })
  totalTn: number;

  @Column({ type: 'text', nullable: true })
  observaciones?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  usuario?: string | null;

  @OneToMany('ConteoPlayaRolloItem', 'conteo', { cascade: true })
  items: ConteoPlayaRolloItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
