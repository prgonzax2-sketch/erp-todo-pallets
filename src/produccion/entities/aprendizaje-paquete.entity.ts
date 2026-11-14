import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('aprendizaje_paquetes')
export class AprendizajePaquete {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  espesor: number;

  @Column()
  ancho: number;

  @Column()
  largo: number;

  @Column({ nullable: true })
  especie: string;

  @Column({ default: 0 })
  piezasPorPaquete: number;

  @Column('jsonb', { default: [] })
  separadores: any[];

  @Column('jsonb', { default: [] })
  tacos: any[];

  @Column({ default: 0 })
  vecesUsado: number;

  @CreateDateColumn()
  creadoEn: Date;
}