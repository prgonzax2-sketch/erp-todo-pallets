import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('backup_runs')
export class BackupRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fileName: string;

  @Column({ default: 'running' })
  status: 'running' | 'completed' | 'failed';

  @Column({ type: 'bigint', nullable: true })
  fileSizeBytes: number | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ default: 'pending' })
  cloudStatus: 'disabled' | 'failed';

  @CreateDateColumn()
  createdAt: Date;
}