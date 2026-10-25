const { ok } = require('../utils/response');
const { checkDb } = require('../config/db');

async function health(_req, res) {
  const data = {
    status: 'ok',
    time: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    version: require('../../package.json').version
  };
  if (process.env.DATABASE_URL) {
    data.db = await checkDb();
    if (data.db === 'down') data.status = 'degraded';
  }
  return ok(res, data);
}

module.exports = { health };
