import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('produccion')
export class ProduccionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fecha: string;

  @Column()
  turno: string;

  @Column()
  tipoProducto: string;

  @Column()
  especie: string;

  @Column()
  descripcionProducto: string;

  @Column({ nullable: true })
  aserradero: string;

  @Column({ nullable: true })
  lote: string;

  @Column({ nullable: true })
  observaciones: string;

  @Column()
  unidadMedida: string;

  @Column()
  unidadDimensiones: string;

  @Column()
  unidadResultado: string;

  @Column('float')
  cantidadPaquetes: number;

  @Column('float', { default: 0 })
  cantidadReservada: number;

  @Column('float')
  piezasPorPaquete: number;

  @Column('float')
  espesor: number;

  @Column('float')
  ancho: number;

  @Column('float')
  largo: number;

  @Column('jsonb', { default: [] })
  separadores: any[];

  @Column('jsonb', { default: [] })
  tacos: any[];

  @Column('jsonb', { default: [] })
  tags: any[];

  @CreateDateColumn()
  createdAt: Date;
}
