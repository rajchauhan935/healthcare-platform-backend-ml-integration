const {
  validateAssignAmbulanceDto
} = require('./assign-ambulance.dto');

const validateReassignAmbulanceDto = (body) => {
  const { ambulanceId } = validateAssignAmbulanceDto(body);
  const reason = body?.reason;

  if (
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.length > 500
  ) {
    const error = new Error(
      'A reassignment reason is required (maximum 500 characters)'
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    ambulanceId,
    reason: reason.trim()
  };
};

module.exports = {
  validateReassignAmbulanceDto
};
