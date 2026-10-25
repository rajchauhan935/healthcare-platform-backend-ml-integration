
const pool = require('../config/db');
const { mapToCamelCase } = require('./mapper');

async function query(text, params = []) {
  if (typeof text !== 'string' || !Array.isArray(params)) {
    throw new TypeError('Query must be a string with an array of parameters');
  }

  const result = await pool.query(text, params);

  return {
    rows: mapToCamelCase(result.rows),
    rowCount: result.rowCount,
  };
}

module.exports = { query };
