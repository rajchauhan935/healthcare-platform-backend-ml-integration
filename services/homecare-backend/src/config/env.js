const dotenv = require('dotenv');

dotenv.config();

function loadEnv() {
  const env = {
    PORT: Number(process.env.PORT || 4000),
    NODE_ENV: process.env.NODE_ENV || 'development',
    DATABASE_URL: process.env.DATABASE_URL || '',
    DATABASE_URL_TEST: process.env.DATABASE_URL_TEST || '',
    JWT_SECRET: process.env.JWT_SECRET || '',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
    CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
      .split(',').map((item) => item.trim()).filter(Boolean),
    DASHBOARD_SOURCE: process.env.DASHBOARD_SOURCE || 'file',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };

  if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) {
    throw new Error('PORT must be a valid TCP port.');
  }
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }
  if (!['file', 'db'].includes(env.DASHBOARD_SOURCE)) {
    throw new Error('DASHBOARD_SOURCE must be "file" or "db".');
  }
  if (env.NODE_ENV === 'production' && !env.JWT_SECRET) {
    throw new Error('Missing required environment variable: JWT_SECRET');
  }
  return env;
}

module.exports = { loadEnv };
