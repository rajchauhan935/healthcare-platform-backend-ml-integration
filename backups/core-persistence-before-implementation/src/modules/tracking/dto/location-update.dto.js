const validateLocationUpdate = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      success: false,
      message: 'A location update object is required'
    };
  }

  const { latitude, longitude, timestamp } = body;

  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return {
      success: false,
      message: 'Latitude must be a number between -90 and 90'
    };
  }

  if (
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      success: false,
      message: 'Longitude must be a number between -180 and 180'
    };
  }

  if (
    typeof timestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp))
  ) {
    return {
      success: false,
      message: 'A valid ISO 8601 timestamp with timezone is required'
    };
  }

  return {
    success: true,
    data: {
      latitude,
      longitude,
      timestamp: new Date(timestamp).toISOString()
    }
  };
};

module.exports = {
  validateLocationUpdate
};
