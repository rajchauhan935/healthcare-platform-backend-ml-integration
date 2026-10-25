const service = require('./hospitals.service');

const {
  validateCreateHospital
} = require('./dto/create-hospital.dto');

const {
  validateUpdateCapacity
} = require('./dto/update-capacity.dto');

const getAllHospitals = (req, res) => {
  return res.json({
    success: true,
    data: service.getAllHospitals()
  });
};

const getHospitalById = (req, res) => {
  const hospital = service.getHospitalById(req.params.id);

  if (!hospital) {
    return res.status(404).json({
      success: false,
      message: 'Hospital not found'
    });
  }

  return res.json({
    success: true,
    data: hospital
  });
};

const createHospital = (req, res) => {
  const errors = validateCreateHospital(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const hospital = service.createHospital(req.body);

  return res.status(201).json({
    success: true,
    data: hospital
  });
};

const getHospitalCapacity = (req, res) => {
  const result = service.getHospitalCapacity(req.params.id);

  if (!result) {
    return res.status(404).json({
      success: false,
      message: 'Hospital not found'
    });
  }

  return res.json({
    success: true,
    data: result
  });
};

const updateHospitalCapacity = (req, res) => {
  const errors = validateUpdateCapacity(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const result = service.updateHospitalCapacity(
    req.params.id,
    req.body
  );

  if (!result) {
    return res.status(404).json({
      success: false,
      message: 'Hospital not found'
    });
  }

  return res.json({
    success: true,
    data: result
  });
};

module.exports = {
  getAllHospitals,
  getHospitalById,
  createHospital,
  getHospitalCapacity,
  updateHospitalCapacity
};