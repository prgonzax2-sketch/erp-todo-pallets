import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('rubros')
export class Rubro {
  @PrimaryGeneratedColumn()
  id: number;

  // Unicidad de negocio normalizada (lower/btrim) vía SQL funcional + precheck servicio.
  @Index(['nombre'])
  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  creadoEn: Date;

  @UpdateDateColumn()
  actualizadoEn: Date;
}
