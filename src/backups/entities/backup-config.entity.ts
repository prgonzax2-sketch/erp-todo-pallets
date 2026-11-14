import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('backup_config')
export class BackupConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: true })
  localEnabled: boolean;

  @Column({ type: 'varchar', default: '20:00' })
  backupTime: string;

  @Column({ default: 30 })
  retentionDays: number;

  @UpdateDateColumn()
  updatedAt: Date;
}