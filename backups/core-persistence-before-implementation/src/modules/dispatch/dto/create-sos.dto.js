const validateCreateSosDto = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('A valid JSON request body is required');
    error.statusCode = 400;
    throw error;
  }

  const { pickupLocation, emergencyType, description } = body;

  const invalidLocation =
    !pickupLocation ||
    typeof pickupLocation !== 'object' ||
    Array.isArray(pickupLocation) ||
    typeof pickupLocation.latitude !== 'number' ||
    typeof pickupLocation.longitude !== 'number' ||
    !Number.isFinite(pickupLocation.latitude) ||
    !Number.isFinite(pickupLocation.longitude) ||
    pickupLocation.latitude < -90 ||
    pickupLocation.latitude > 90 ||
    pickupLocation.longitude < -180 ||
    pickupLocation.longitude > 180;

  if (invalidLocation) {
    const error = new Error(
      'pickupLocation must contain valid latitude and longitude'
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    typeof emergencyType !== 'string' ||
    !emergencyType.trim() ||
    emergencyType.length > 100
  ) {
    const error = new Error(
      'emergencyType is required (maximum 100 characters)'
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    description !== undefined &&
    description !== null &&
    (typeof description !== 'string' || description.length > 1000)
  ) {
    const error = new Error(
      'description must be a string of at most 1000 characters'
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    pickupLocation: {
      latitude: pickupLocation.latitude,
      longitude: pickupLocation.longitude
    },
    emergencyType: emergencyType.trim(),
    description: description ? description.trim() : null
  };
};

module.exports = {
  validateCreateSosDto
};
