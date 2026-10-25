const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' },
  }),
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
  }),
});

module.exports = { loginLimiter, apiLimiter };
