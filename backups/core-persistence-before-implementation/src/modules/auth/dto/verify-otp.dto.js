const validateVerifyOtp = (data) => {
  const errors = [];

  // Check that the request contains data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['Request body is required'];
  }

  // Check email format
  if (
    typeof data.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())
  ) {
    errors.push('A valid email address is required');
  }

  // Check OTP format: exactly six digits
  if (
    typeof data.otp !== 'string' ||
    !/^\d{6}$/.test(data.otp)
  ) {
    errors.push('OTP must contain exactly 6 digits');
  }

  return errors;
};

module.exports = {
  validateVerifyOtp
};
