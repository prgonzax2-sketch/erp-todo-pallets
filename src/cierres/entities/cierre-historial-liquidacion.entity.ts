import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('cierres_historial_liquidaciones')
@Index(['aserradero', 'clave'])
export class CierreHistorialLiquidacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero: string | null;

  /** Clave deduplicación: idEmp-fecha-monto-mes-anio o hash simple */
  @Column({ type: 'varchar', length: 200 })
  clave: string;

  @Column({ type: 'jsonb' })
  datos: Record<string, any>;

  @CreateDateColumn()
  creadoEn: Date;
}
