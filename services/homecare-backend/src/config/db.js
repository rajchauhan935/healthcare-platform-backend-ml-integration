const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error.message));
  }
  return pool;
}

async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) throw new Error('DATABASE_URL is not configured');
  return activePool.query(text, params);
}

async function checkDb() {
  try {
    await query('SELECT 1');
    return 'up';
  } catch (_error) {
    return 'down';
  }
}

async function closeDb() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { getPool, query, checkDb, closeDb };
