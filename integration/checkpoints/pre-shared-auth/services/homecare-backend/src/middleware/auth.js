const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

function authenticate(req, _res, next) {
  const header = req.get('authorization');
  if (!header) return next(new AppError(401, 'UNAUTHORIZED', 'Bearer token is required'));
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return next(new AppError(401, 'UNAUTHORIZED', 'Authorization header must use Bearer token'));
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (_error) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token is invalid or expired'));
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource'));
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
