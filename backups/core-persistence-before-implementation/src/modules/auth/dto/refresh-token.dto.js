const validateRefreshToken = (data) => {
  const errors = [];

  // Check whether the request body exists
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['Request body is required'];
  }

  // Check whether a refresh token was provided
  if (
    typeof data.refreshToken !== 'string' ||
    !data.refreshToken.trim()
  ) {
    errors.push('Refresh token is required');
  }

  return errors;
};

module.exports = {
  validateRefreshToken
};
