const tripsService = require('./trips.service');

const currentUser = require(
  '../auth/decorators/current-user.decorator'
);

const handleError = (error, res) => {
  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? 'An unexpected trip error occurred'
        : error.message
  });
};

const createTrip = (req, res) => {
  try {
    const trip = tripsService.createTrip(
      req.body,
      currentUser(req)
    );

    return res.status(201).json({
      success: true,
      message: 'Trip created successfully',
      data: trip
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const getTrip = (req, res) => {
  try {
    const trip = tripsService.getTrip(
      req.params.id,
      currentUser(req)
    );

    return res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const getTripByDispatchId = (req, res) => {
  try {
    const trip = tripsService.getTripByDispatchId(
      req.params.dispatchId,
      currentUser(req)
    );

    return res.status(200).json({
      success: true,
      data: trip
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const updateTripStatus = (req, res) => {
  try {
    const trip = tripsService.updateTripStatus(
      req.params.id,
      req.body,
      currentUser(req)
    );

    return res.status(200).json({
      success: true,
      message: 'Trip status updated successfully',
      data: trip
    });
  } catch (error) {
    return handleError(error, res);
  }
};

const cancelTrip = (req, res) => {
  try {
    const trip = tripsService.cancelTrip(
      req.params.id,
      req.body?.reason,
      currentUser(req)
    );

    return res.status(200).json({
      success: true,
      message: 'Trip cancelled successfully',
      data: trip
    });
  } catch (error) {
    return handleError(error, res);
  }
};

module.exports = {
  createTrip,
  getTrip,
  getTripByDispatchId,
  updateTripStatus,
  cancelTrip
};
