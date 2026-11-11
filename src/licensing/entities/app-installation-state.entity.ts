import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Estado de instalación/actualización (single-row, id=1).
 * SQL: docs/sql-migrations/2026-11-11-licensing-client-state.sql
 */
@Entity('app_installation_state')
export class AppInstallationState {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  @Column({ name: 'installed_version', type: 'varchar', length: 64, nullable: true })
  installedVersion?: string | null;

  @Column({ name: 'admin_seeded_at', type: 'timestamptz', nullable: true })
  adminSeededAt?: Date | null;

  @Column({ name: 'initialized_at', type: 'timestamptz', nullable: true })
  initializedAt?: Date | null;

  @Column({ name: 'last_update_check_at', type: 'timestamptz', nullable: true })
  lastUpdateCheckAt?: Date | null;

  @Column({ name: 'update_available_version', type: 'varchar', length: 64, nullable: true })
  updateAvailableVersion?: string | null;

  @Column({ name: 'update_manifest_meta', type: 'jsonb', nullable: true })
  updateManifestMeta?: Record<string, any> | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
