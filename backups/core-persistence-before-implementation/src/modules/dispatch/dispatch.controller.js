const dispatchService = require('./dispatch.service');

const currentUser = require(
  '../auth/decorators/current-user.decorator'
);

const handleError = (error, res) => {
  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? 'An unexpected dispatch error occurred'
        : error.message
  });
};

// POST /api/v1/dispatch/sos
const createSos = (req, res) => {
  try {
    const user = currentUser(req);

    if (!user || user.role !== 'PATIENT') {
      return res.status(403).json({
        success: false,
        message: 'Only patients can create SOS requests'
      });
    }

    const result = dispatchService.createSos(
      user.id,
      req.body,
      req.get('Idempotency-Key')
    );

    return res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created
        ? 'SOS request created successfully'
        : 'Existing SOS request returned',
      data: result.dispatch
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// GET /api/v1/dispatch/:id
const getDispatch = (req, res) => {
  try {
    const user = currentUser(req);

    const dispatch = dispatchService.getDispatch(
      req.params.id,
      user
    );

    return res.status(200).json({
      success: true,
      data: dispatch
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// POST /api/v1/dispatch/:id/assign
const assignAmbulance = (req, res) => {
  try {
    const user = currentUser(req);

    const dispatch = dispatchService.assignAmbulance(
      req.params.id,
      req.body?.ambulanceId,
      user
    );

    return res.status(200).json({
      success: true,
      message: 'Ambulance assigned successfully',
      data: dispatch
    });
  } catch (error) {
    return handleError(error, res);
  }
};

// POST /api/v1/dispatch/:id/reassign
const reassignAmbulance = (req, res) => {
  try {
    const user = currentUser(req);

    const dispatch = dispatchService.reassignAmbulance(
      req.params.id,
      req.body?.ambulanceId,
      req.body?.reason,
      user
    );

    return res.status(200).json({
      success: true,
      message: 'Ambulance reassigned successfully',
      data: dispatch
    });
  } catch (error) {
    return handleError(error, res);
  }
};

module.exports = {
  createSos,
  getDispatch,
  assignAmbulance,
  reassignAmbulance
};
