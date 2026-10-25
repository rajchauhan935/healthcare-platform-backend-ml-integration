require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before seeding.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const users = [
    ['U-001', 'Demo Patient', 'patient@demo.test', 'DemoPatient#2026', 'patient'],
    ['U-002', 'Demo Operations', 'ops@demo.test', 'DemoOps#2026', 'ops'],
    ['U-003', 'Demo Admin', 'admin@demo.test', 'DemoAdmin#2026', 'admin']
  ];
  try {
    for (const [id, name, email, password, role] of users) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `INSERT INTO users (id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
        [id, name, email, hash, role]
      );
    }
    console.log('Demo users seeded. Development only; never use these credentials in production.');
  } finally {
    await pool.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
