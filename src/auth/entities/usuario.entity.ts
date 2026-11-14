import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ default: 'empleado' }) // 'admin' o 'empleado'
  rol: string;

  @Column({ nullable: true })
  empleadoId: number; // Para vincularlo con su ficha de empleado si corresponde

  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn()
  fechaCreacion: Date;
}