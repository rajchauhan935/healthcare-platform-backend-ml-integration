const validateCreateTripDto = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('A valid JSON body is required');
    error.statusCode = 400;
    throw error;
  }

  const { dispatchId, hospitalId = null } = body;

  if (
    typeof dispatchId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      dispatchId
    )
  ) {
    const error = new Error('A valid dispatchId is required');
    error.statusCode = 400;
    throw error;
  }

  if (
    hospitalId !== null &&
    (!Number.isSafeInteger(hospitalId) || hospitalId <= 0)
  ) {
    const error = new Error(
      'hospitalId must be a positive integer or null'
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    dispatchId,
    hospitalId
  };
};

module.exports = {
  validateCreateTripDto
};
