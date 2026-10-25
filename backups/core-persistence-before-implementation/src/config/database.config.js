const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

async function checkDatabaseConnection() {
  const result = await pool.query(
    'SELECT current_database() AS database, current_user AS username'
  );

  return result.rows[0];
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  checkDatabaseConnection,
};