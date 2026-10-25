const auditService = require('./audit.service');

const getAllLogs = (req, res) => {
  return res.status(200).json({
    success: true,
    data: auditService.getAllLogs()
  });
};

const getLogsByUserId = (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID'
    });
  }

  return res.status(200).json({
    success: true,
    data: auditService.getLogsByUserId(userId)
  });
};

const createLog = (req, res) => {
  const { userId, action, resource } = req.body;

  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    typeof action !== 'string' ||
    !action.trim() ||
    typeof resource !== 'string' ||
    !resource.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: 'Valid userId, action and resource are required'
    });
  }

  const log = auditService.createLog({
    userId,
    action,
    resource
  });

  return res.status(201).json({
    success: true,
    message: 'Audit log created successfully',
    data: log
  });
};

module.exports = {
  getAllLogs,
  getLogsByUserId,
  createLog
};
