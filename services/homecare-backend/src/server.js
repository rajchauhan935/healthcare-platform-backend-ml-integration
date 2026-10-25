const { loadEnv } = require('./config/env');
const app = require('./app');
const { closeDb } = require('./config/db');

const env = loadEnv();
const server = app.listen(env.PORT, () => {
  console.log(`Healthcare backend listening on port ${env.PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
