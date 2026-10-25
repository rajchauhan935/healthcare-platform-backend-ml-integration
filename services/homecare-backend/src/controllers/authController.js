const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');

const demoUsers = [
  { id: 'U-001', name: 'Demo Patient', email: 'patient@demo.test', role: 'patient', password: 'DemoPatient#2026' },
  { id: 'U-002', name: 'Demo Operations', email: 'ops@demo.test', role: 'ops', password: 'DemoOps#2026' },
  { id: 'U-003', name: 'Demo Admin', email: 'admin@demo.test', role: 'admin', password: 'DemoAdmin#2026' }
];

async function findUserByEmail(email) {
  try {
    const result = await db.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [email]
    );
    return result.rows[0] || null;
  } catch (_error) {
    if (process.env.NODE_ENV === 'production') throw new AppError(503, 'UPSTREAM_UNAVAILABLE', 'Authentication service is unavailable');
    const found = demoUsers.find((user) => user.email.toLowerCase() === email.toLowerCase());
    if (!found) return null;
    return { id: found.id, name: found.name, email: found.email, role: found.role, password_hash: await bcrypt.hash(found.password, 10) };
  }
}


async function login(req, res) {
  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required(),
    password: Joi.string().min(1).required()
  }).unknown(false);

  const { error, value } = schema.validate(req.body);

  if (error) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Email and password are required'
    );
  }

  const user = await findUserByEmail(value.email);

  const matches = user
    ? await bcrypt.compare(value.password, user.password_hash)
    : false;

  if (!matches) {
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Email or password is incorrect'
    );
  }

  const token = jwt.sign(
    {
      sub: String(user.id),
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    }
  );

  return ok(res, {
    token,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
}


async function me(req, res) {
  try {
    const result = await db.query('SELECT id, name, email, role FROM users WHERE id = $1 LIMIT 1', [req.user.id]);
    const user = result.rows[0];
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User was not found');
    return ok(res, user);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (process.env.NODE_ENV === 'production') throw new AppError(503, 'UPSTREAM_UNAVAILABLE', 'Session service is unavailable');
    const user = demoUsers.find((item) => item.id === req.user.id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User was not found');
    return ok(res, { id: user.id, name: user.name, email: user.email, role: user.role });
  }
}

module.exports = { login, me, demoUsers };
