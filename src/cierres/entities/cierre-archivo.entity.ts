import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('cierres_archivos')
@Index(['aserradero', 'idCierre'], { unique: true })
export class CierreArchivo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero: string | null;

  @Column({ type: 'varchar', length: 120 })
  idCierre: string;

  @Column({ type: 'jsonb' })
  datos: Record<string, any>;

  @CreateDateColumn()
  creadoEn: Date;
}
