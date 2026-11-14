import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

export type GrupoEspecieConfig = 'PINO' | 'EUCALIPTO' | 'MEZCLA' | 'OTRO';

@Entity('conciliacion_coef_config')
@Unique('UQ_conciliacion_coef_config_aserradero_grupo', ['aserradero', 'grupoEspecie'])
export class ConciliacionCoefConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  aserradero: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  grupoEspecie: GrupoEspecieConfig;

  @Column('float', { nullable: true }) rendimientoMadera?: number | null;
  @Column('float', { nullable: true }) coefAserrin?: number | null;
  @Column('float', { nullable: true }) coefChip?: number | null;
  @Column('float', { nullable: true }) factorTnConsumo?: number | null;
  @Column('float', { nullable: true }) m3UtilPorP2?: number | null;
  @Column('float', { nullable: true }) factorTnPlayaDefault?: number | null; // sugerencia conteo-playa
  @Column('float', { nullable: true }) factorTnAserrin?: number | null; // m³ aserrín -> TN (opcional, sin default inventado)
  @Column('float', { nullable: true }) factorTnChip?: number | null; // m³ chip -> TN (opcional, sin default inventado)

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  usuario?: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
