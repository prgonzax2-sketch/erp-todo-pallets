import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Carga .env si existe (CLI/dev) sin dependencia externa.
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2] ?? '';
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    v = v.replace(/\\n/g, '\n');
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'admin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? 'erp_database',
  synchronize: false,
  logging: false,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/database/migrations/*.js', 'dist/migrations/*.js'],
  migrationsTableName: 'migrations',
});
