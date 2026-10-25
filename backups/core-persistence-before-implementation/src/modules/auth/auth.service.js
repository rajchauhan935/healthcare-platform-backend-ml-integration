const usersRepository = require('../users/users.repository');

const {
  createOtp,
  verifyOtp
} = require('./strategies/otp.strategy');

const {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken
} = require('./strategies/jwt.strategy');

const findUser = (email) => {
  return usersRepository.findByEmail(email.trim().toLowerCase());
};

const requestOtp = async (email) => {
  const user = findUser(email);

  if (!user) {
    return {
      success: false,
      message: 'Account not found in local demo data'
    };
  }

  const otp = await createOtp(user.email);

  return {
    success: true,
    message: 'OTP generated for local development',
    otp
  };
};

const loginWithOtp = async (email, submittedOtp) => {
  const user = findUser(email);

  if (!user) {
    return { success: false, message: 'Invalid email or OTP' };
  }

  const result = await verifyOtp(user.email, submittedOtp);

  if (!result.success) {
    return { success: false, message: result.message };
  }

  return {
    success: true,
    accessToken: createAccessToken(user),
    refreshToken: createRefreshToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
};

const refreshAccessToken = (token) => {
  try {
    const payload = verifyRefreshToken(token);
    const user = usersRepository.findById(payload.sub);

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    return {
      success: true,
      accessToken: createAccessToken(user)
    };
  } catch (error) {
    return {
      success: false,
      message: 'Invalid or expired refresh token'
    };
  }
};

module.exports = {
  requestOtp,
  loginWithOtp,
  refreshAccessToken
};