import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { ConteoPlayaRollo } from './conteo-playa-rollo.entity.js';

@Entity('conteos_playa_rollo_items')
export class ConteoPlayaRolloItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne('ConteoPlayaRollo', 'items', { onDelete: 'CASCADE' })
  conteo: ConteoPlayaRollo;

  @Column({ type: 'float' })
  largoRollo: number;

  @Column({ type: 'float' })
  metrosLineales: number;

  @Column({ type: 'float' })
  alto: number;

  @Column({ type: 'float' })
  m3Pila: number;

  @Column({ type: 'float', default: 0.7 })
  factorTn: number;

  @Column({ type: 'float' })
  tn: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  grupoEspecie?: string | null; // PINO|EUCALIPTO|MEZCLA|etc
}
