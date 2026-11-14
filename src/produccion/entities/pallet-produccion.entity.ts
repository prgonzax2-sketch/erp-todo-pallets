import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pallet_producciones_diarias')
export class PalletProduccionDiaria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  palletId: number;

  @Column()
  cantidad: number;

  @Column({ type: 'numeric', precision: 10, scale: 4, default: 0 })
  tarifaManoObra: number;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  fecha: Date;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero?: string | null;

  /** Mesa desde la cual se registró la producción (opcional, para reparto). */
  @Column({ type: 'int', nullable: true })
  mesaId?: number | null;

  /** Operario/empleado al que se asignó la cantidad (reparto automático). */
  @Column({ type: 'int', nullable: true })
  empleadoId?: number | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  empleadoNombre?: string | null;

  @CreateDateColumn()
  creadoEn: Date;
}