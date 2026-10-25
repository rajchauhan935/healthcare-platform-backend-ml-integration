const validateAssignAmbulanceDto = (body) => {
  const ambulanceId = body?.ambulanceId;

  if (
    !Number.isSafeInteger(ambulanceId) ||
    ambulanceId <= 0
  ) {
    const error = new Error(
      'ambulanceId must be a positive integer'
    );
    error.statusCode = 400;
    throw error;
  }

  return { ambulanceId };
};

module.exports = {
  validateAssignAmbulanceDto
};
