const jwt = require('jsonwebtoken');

const getSecret = (type) => {
  const secret = type === 'refresh'
    ? process.env.JWT_REFRESH_SECRET
    : process.env.JWT_ACCESS_SECRET;

  if (!secret) {
    throw new Error(`Missing JWT ${type} secret in .env`);
  }

  return secret;
};

const createAccessToken = (user) => {
  return jwt.sign(
    { sub: String(user.id), role: user.role, type: 'access' },
    getSecret('access'),
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
};

const createRefreshToken = (user) => {
  return jwt.sign(
    { sub: String(user.id), type: 'refresh' },
    getSecret('refresh'),
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

const verifyAccessToken = (token) => {
  const payload = jwt.verify(token, getSecret('access'));

  if (payload.type !== 'access') {
    throw new Error('Invalid token type');
  }

  return payload;
};

const verifyRefreshToken = (token) => {
  const payload = jwt.verify(token, getSecret('refresh'));

  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  return payload;
};

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};