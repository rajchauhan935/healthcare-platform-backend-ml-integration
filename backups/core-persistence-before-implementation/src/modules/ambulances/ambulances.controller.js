const service = require('./ambulances.service');

const {
  validateUpdateAmbulanceStatus
} = require('./dto/update-ambulance-status.dto');

const getAllAmbulances = (req, res) => {
  return res.status(200).json({
    success: true,
    data: service.getAllAmbulances()
  });
};

const getAvailableAmbulances = (req, res) => {
  const rawEquipment = req.query.equipment;

  if (
    rawEquipment !== undefined &&
    (
      typeof rawEquipment !== 'string' ||
      rawEquipment.length > 200
    )
  ) {
    return res.status(400).json({
      success: false,
      message: 'equipment must be a comma-separated string'
    });
  }

  const requiredEquipment = rawEquipment
    ? rawEquipment
        .split(',')
        .map(item => item.trim().toUpperCase())
        .filter(Boolean)
    : [];

  return res.status(200).json({
    success: true,
    data: service.getAvailableAmbulances({
      requiredEquipment
    })
  });
};

const getAmbulanceById = (req, res) => {
  const ambulance = service.getAmbulanceById(req.params.id);

  if (!ambulance) {
    return res.status(404).json({
      success: false,
      message: 'Ambulance not found'
    });
  }

  return res.status(200).json({
    success: true,
    data: ambulance
  });
};

const updateAmbulanceStatus = (req, res) => {
  const errors = validateUpdateAmbulanceStatus(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const result = service.updateAmbulanceStatus(
    req.params.id,
    req.body.status
  );

  if (!result.success) {
    return res.status(result.statusCode).json(result);
  }

  return res.status(200).json(result);
};

module.exports = {
  getAllAmbulances,
  getAvailableAmbulances,
  getAmbulanceById,
  updateAmbulanceStatus
};