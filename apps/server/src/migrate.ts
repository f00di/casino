import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';

const config = loadConfig();
if (config.databaseUrl === undefined) throw new Error('DATABASE_URL is required to run migrations.');
const client = new pg.Client({ connectionString: config.databaseUrl, ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const filename of files) {
    const exists = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if ((exists.rowCount ?? 0) > 0) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(resolve(directory, filename), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally { await client.end(); }
