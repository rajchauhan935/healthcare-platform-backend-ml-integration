const service = require('./patients.service');

const {
  validateCreatePatient
} = require('./dto/create-patient.dto');

const {
  validateUpdatePatient
} = require('./dto/update-patient.dto');

const getAllPatients = (req, res) => {
  return res.status(200).json({
    success: true,
    data: service.getAllPatients()
  });
};

const getPatientById = (req, res) => {
  const patient = service.getPatientById(req.params.id);

  if (!patient) {
    return res.status(404).json({
      success: false,
      message: 'Patient not found'
    });
  }

  return res.status(200).json({
    success: true,
    data: patient
  });
};

const createPatient = (req, res) => {
  const errors = validateCreatePatient(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const result = service.createPatient(req.body);

  if (result.error) {
    return res.status(result.status).json({
      success: false,
      message: result.error
    });
  }

  return res.status(201).json({
    success: true,
    message: 'Patient created successfully',
    data: result.data
  });
};

const updatePatient = (req, res) => {
  const existing = service.getPatientById(req.params.id);

  if (!existing) {
    return res.status(404).json({
      success: false,
      message: 'Patient not found'
    });
  }

  const errors = validateUpdatePatient(
    req.body,
    existing.userId
  );

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const result = service.updatePatient(req.params.id, req.body);

  return res.status(200).json({
    success: true,
    message: 'Patient updated successfully',
    data: result.data
  });
};

const deletePatient = (req, res) => {
  const result = service.deletePatient(req.params.id);

  if (result.error) {
    return res.status(result.status).json({
      success: false,
      message: result.error
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Patient deleted successfully'
  });
};

module.exports = {
  getAllPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient
};