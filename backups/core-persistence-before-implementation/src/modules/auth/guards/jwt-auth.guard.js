const { verifyAccessToken } = require('../strategies/jwt.strategy');

const jwtAuthGuard = (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const match = /^Bearer (.+)$/i.exec(authorization);

  if (!match) {
    return res.status(401).json({
      success: false,
      message: 'Access token is required'
    });
  }

  try {
    const payload = verifyAccessToken(match[1]);
    req.user = {
      id: Number(payload.sub),
      role: payload.role
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired access token'
    });
  }
};

module.exports = jwtAuthGuard;