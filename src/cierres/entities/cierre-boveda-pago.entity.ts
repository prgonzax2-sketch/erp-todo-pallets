import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('cierres_boveda_pagos')
@Index(['aserradero', 'idUnico'], { unique: true })
export class CierreBovedaPago {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero: string | null;

  @Column({ type: 'varchar', length: 120 })
  idUnico: string;

  @Column({ type: 'jsonb' })
  datos: Record<string, any>;

  @CreateDateColumn()
  creadoEn: Date;

  @UpdateDateColumn()
  actualizadoEn: Date;
}
