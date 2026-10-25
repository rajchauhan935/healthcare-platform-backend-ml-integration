process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-32-characters';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CORS_ORIGINS = 'http://localhost:5173,http://localhost:5174';
process.env.DASHBOARD_SOURCE = 'file';
