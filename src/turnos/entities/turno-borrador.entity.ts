import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Fase 5 (SDD turnos-json-a-postgres, F1) — Dual-Write PG+JSON (JSON fallback/safety net).
 * Mapea borradores_db.json:
 *   clave: (borrador|cerrado)_${fecha}_${tipoTurno}  ->  1 fila por (fecha,tipoTurno,empleadoId)
 *   valor por empleado: { hs,pal,lim,car,des,precio,pres,...rest }
 *
 * Decisiones confirmadas: unique(fecha,tipoTurno,empleadoId) con estado mutable (UPDATE BORRADOR->CERRADO);
 * fecha varchar(10) 'YYYY-MM-DD' (consistencia/TZ); sin FK física a empleados; numeric(12,2) métricas/precios.
 */
export type TurnoBorradorEstado = 'BORRADOR' | 'CERRADO';
export type TurnoTipoPlanilla = 'MAÑANA' | 'TARDE' | 'NOCHE' | 'UNICO';

@Entity('turnos_borradores')
@Index('idx_turnos_borr_fecha_turno', ['fecha', 'tipoTurno'])
@Index('idx_turnos_borr_empleado_fecha', ['empleadoId', 'fecha'])
@Index('idx_turnos_borr_aserradero_fecha', ['aserradero', 'fecha'])
@Index('idx_turnos_borr_estado_fecha', ['estado', 'fecha'])
@Index('uq_turnos_borr_fecha_turno_empleado', ['fecha', 'tipoTurno', 'empleadoId'], {
  unique: true,
})
export class TurnoBorrador {
  @PrimaryGeneratedColumn()
  id: number;

  /** Nullable por compat legacy; poblar desde empleado/scope cuando esté disponible. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  aserradero?: string | null;

  /** Sin FK física (createForeignKeyConstraints N/A: no relación) — backfill tolera IDs históricos huérfanos. */
  @Column({ type: 'int' })
  empleadoId: number;

  /** Día civil YYYY-MM-DD (varchar por consistencia/TZ con JSON y resto del ERP). */
  @Column({ type: 'varchar', length: 10 })
  fecha: string;

  /** MAÑANA | TARDE | NOCHE | UNICO. */
  @Column({ type: 'varchar', length: 20 })
  tipoTurno: string;

  /** BORRADOR | CERRADO (mapea prefijo borrador_/cerrado_). */
  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, default: 0 })
  hs?: string | number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, default: 0 })
  pal?: string | number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, default: 0 })
  lim?: string | number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, default: 0 })
  car?: string | number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, default: 0 })
  des?: string | number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, default: 0 })
  precio?: string | number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, default: 0 })
  pres?: string | number | null;

  /** Campos extra/legacy no modelados (sin inventar ni perder). */
  @Column({ type: 'jsonb', nullable: true })
  datosExtra?: Record<string, unknown> | null;

  /** Trazabilidad: JSON_LEGACY | BACKFILL | DUAL_WRITE | API */
  @Column({ type: 'varchar', length: 30, nullable: true })
  origen?: string | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true })
  creadoEn?: Date | null;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  actualizadoEn?: Date | null;
}