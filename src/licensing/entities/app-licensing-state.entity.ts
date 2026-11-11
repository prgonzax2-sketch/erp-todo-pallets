import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Estado de licenciamiento cliente (single-row, id=1).
 * Migración TypeORM idempotente (SQL manual complementario): docs/sql-migrations/2026-11-11-licensing-client-state.sql
 */
@Entity('app_licensing_state')
export class AppLicensingState {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  @Column({ name: 'instance_id', type: 'varchar', length: 128, nullable: true })
  instanceId?: string | null;

  @Column({ name: 'machine_id_hash', type: 'varchar', length: 128, nullable: true })
  machineIdHash?: string | null;

  @Column({ name: 'fingerprint_hash', type: 'varchar', length: 128, nullable: true })
  fingerprintHash?: string | null;

  @Column({ name: 'license_status', type: 'varchar', length: 32, nullable: true })
  licenseStatus?: string | null;

  @Column({ name: 'plan_code', type: 'varchar', length: 64, nullable: true })
  planCode?: string | null;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil?: Date | null;

  @Column({ name: 'grace_deadline_at', type: 'timestamptz', nullable: true })
  graceDeadlineAt?: Date | null;

  @Column({ name: 'last_check_at', type: 'timestamptz', nullable: true })
  lastCheckAt?: Date | null;

  @Column({ name: 'last_successful_check_at', type: 'timestamptz', nullable: true })
  lastSuccessfulCheckAt?: Date | null;

  @Column({ name: 'last_server_time', type: 'timestamptz', nullable: true })
  lastServerTime?: Date | null;

  @Column({ name: 'last_token_jws', type: 'text', nullable: true })
  lastTokenJws?: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'clock_tamper_suspected', type: 'boolean', default: false })
  clockTamperSuspected: boolean;

  @Column({ name: 'enforcement_mode', type: 'varchar', length: 16, nullable: true })
  enforcementMode?: string | null;

  @Column({ name: 'app_version', type: 'varchar', length: 64, nullable: true })
  appVersion?: string | null;

  @Column({ name: 'update_available_version', type: 'varchar', length: 64, nullable: true })
  updateAvailableVersion?: string | null;

  @Column({ name: 'update_manifest_meta', type: 'jsonb', nullable: true })
  updateManifestMeta?: Record<string, any> | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
