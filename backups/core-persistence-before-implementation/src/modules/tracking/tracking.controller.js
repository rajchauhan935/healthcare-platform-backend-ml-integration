
const trackingService = require('./tracking.service');

const {
  broadcastLocation
} = require('./tracking.gateway');

// --------------------------------------------------
// POST /api/v1/trips/:id/location
// Submit a new GPS location for an active trip.
// --------------------------------------------------

const updateLocation = (req, res) => {
  try {
    const result = trackingService.updateLocation(
      req.params.id,
      req.body,
      req.user
    );

    // Broadcast only after the service successfully
    // validates and saves the GPS location.
    if (result.success && result.data) {
      broadcastLocation(req.params.id, result.data);
    }

    // Preserve the existing REST response structure.
    return res.status(
      result.statusCode || (result.success ? 200 : 400)
    ).json({
      success: result.success,

      ...(result.message
        ? { message: result.message }
        : {}),

      ...(result.data !== undefined
        ? { data: result.data }
        : {})
    });

  } catch (error) {
    console.error('Tracking update failed:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal tracking error'
    });
  }
};

// --------------------------------------------------
// GET /api/v1/trips/:id/tracking
// Retrieve the latest GPS location for a trip.
// --------------------------------------------------

const getLatestLocation = (req, res) => {
  try {
    const result = trackingService.getLatestLocation(
      req.params.id,
      req.user
    );

    return res.status(
      result.statusCode || (result.success ? 200 : 400)
    ).json({
      success: result.success,

      ...(result.message
        ? { message: result.message }
        : {}),

      ...(result.data !== undefined
        ? { data: result.data }
        : {})
    });

  } catch (error) {
    console.error('Tracking retrieval failed:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal tracking error'
    });
  }
};

// Export both controller functions.
module.exports = {
  updateLocation,
  getLatestLocation
};
