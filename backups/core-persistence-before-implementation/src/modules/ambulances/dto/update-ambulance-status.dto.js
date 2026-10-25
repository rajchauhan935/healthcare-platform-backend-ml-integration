const {
  AMBULANCE_STATUSES
} = require('../entities/ambulance.entity');

const validateUpdateAmbulanceStatus = (body = {}) => {
  const errors = [];

  if (
    typeof body.status !== 'string' ||
    !AMBULANCE_STATUSES.includes(body.status)
  ) {
    errors.push(
      `status must be one of: ${AMBULANCE_STATUSES.join(', ')}`
    );
  }

  if (
    body.reason !== undefined &&
    (
      typeof body.reason !== 'string' ||
      !body.reason.trim() ||
      body.reason.length > 500
    )
  ) {
    errors.push('reason must be a non-empty string of at most 500 characters');
  }

  return errors;
};

module.exports = {
  validateUpdateAmbulanceStatus
};