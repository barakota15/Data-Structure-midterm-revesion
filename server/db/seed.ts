import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from './pool';

const run = async () => {
  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash('password123', 10);
    const userId = randomUUID();
    await client.query(
      `INSERT INTO users (id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [userId, 'owner@example.com', passwordHash, 'quiz_owner']
    );

    await client.query(
      `INSERT INTO users (id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [randomUUID(), 'participant@example.com', passwordHash, 'user']
    );

    process.stdout.write('Seed data inserted.\n');
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
