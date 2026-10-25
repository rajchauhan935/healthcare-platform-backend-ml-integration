const validateRequestOtp = (data) => {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return ['Request body is required'];
  }

  if (
    typeof data.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())
  ) {
    errors.push('A valid email address is required');
  }

  return errors;
};

module.exports = {
  validateRequestOtp
};
