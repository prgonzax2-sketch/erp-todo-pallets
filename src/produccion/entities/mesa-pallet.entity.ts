import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('mesas_pallet')
export class MesaPallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero?: string | null;

  /** IDs de empleados/operarios integrantes de la mesa (orden estable). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  integranteIds: number[];

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  creadoEn: Date;

  @UpdateDateColumn()
  actualizadoEn: Date;
}
