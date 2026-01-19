import fs from 'node:fs';
import path from 'node:path';
import { pool } from './pool';

const migrationsDir = path.join(process.cwd(), 'server', 'migrations');

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      process.stdout.write(`Applied ${file}\n`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
