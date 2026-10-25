const authService = require('./auth.service');

const {
  validateRequestOtp
} = require('./dto/request-otp.dto');

const {
  validateVerifyOtp
} = require('./dto/verify-otp.dto');

const {
  validateRefreshToken
} = require('./dto/refresh-token.dto');

const currentUser = require('./decorators/current-user.decorator');

// 1. Request OTP
const requestOtp = async (req, res) => {

  if (process.env.NODE_ENV !== 'development') {
  return res.status(503).json({
    success: false,
    message: 'OTP delivery is not configured'
  });
}

  const errors = validateRequestOtp(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  try {
    const result = await authService.requestOtp(req.body.email);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Unable to generate OTP'
    });
  }
};

// 2. Verify OTP and generate JWT tokens
const verifyOtp = async (req, res) => {
  const errors = validateVerifyOtp(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  try {
    const result = await authService.loginWithOtp(
      req.body.email,
      req.body.otp
    );

    return res.status(result.success ? 200 : 401).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Unable to complete verification'
    });
  }
};

// 3. Refresh access token
const refreshToken = (req, res) => {
  const errors = validateRefreshToken(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const result = authService.refreshAccessToken(
    req.body.refreshToken
  );

  return res.status(result.success ? 200 : 401).json(result);
};

// 4. Return authenticated user
const getMe = (req, res) => {
  return res.status(200).json({
    success: true,
    data: currentUser(req)
  });
};

// Export all four route handlers
module.exports = {
  requestOtp,
  verifyOtp,
  refreshToken,
  getMe
};