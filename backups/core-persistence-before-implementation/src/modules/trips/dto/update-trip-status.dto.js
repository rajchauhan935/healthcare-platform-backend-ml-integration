const {
  TRIP_STATUSES
} = require('../trip-policy.service');

const validateUpdateTripStatusDto = (body) => {
  const status = body?.status;

  if (
    typeof status !== 'string' ||
    !Object.values(TRIP_STATUSES).includes(status)
  ) {
    const error = new Error(
      'A valid trip status is required'
    );
    error.statusCode = 400;
    throw error;
  }

  return { status };
};

module.exports = {
  validateUpdateTripStatusDto
};
