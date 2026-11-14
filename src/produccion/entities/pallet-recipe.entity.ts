import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pallet_recipes')
export class PalletRecipe {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  nombre: string;

  @Column({ type: 'varchar' })
  especieMadera: string;

  @Column({ type: 'int' })
  piezasMaderaPorPallet: number;

  @Column({ type: 'numeric', precision: 10, scale: 4, default: 0 })
  costoUnitarioMadera: number;

  @Column({ type: 'jsonb', default: [] })
  componentesMadera: any[];

  @Column({ type: 'varchar' })
  tipoClavo: string;

  @Column({ type: 'numeric', precision: 10, scale: 4 })
  costoUnitarioClavo: number;

  @Column({ type: 'int' })
  cantidadClavosPorPallet: number;

  @Column({ type: 'numeric', precision: 10, scale: 4 })
  tarifaManoObra: number;

  @CreateDateColumn()
  creadoEn: Date;
}