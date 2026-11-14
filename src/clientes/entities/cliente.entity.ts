import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('clientes')
export class Cliente {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  cuitDni: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono: string | null;

  @Column({ type: 'varchar', length: 250, nullable: true })
  direccion: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero: string | null;

  /** Alícuota IVA default (%). Nullable: sin valor inventado; lógica aplica default 21% si no configurado. */
  @Column('float', { nullable: true })
  alicuotaIvaDefault?: number | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  creadoEn: Date;
}

