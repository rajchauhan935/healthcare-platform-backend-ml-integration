const repository = require('./patients.repository');

const getAllPatients = () => repository.findAll();

const getPatientById = (id) => repository.findById(id);

const createPatient = (data) => {
  const existing = repository.findByUserId(data.userId);

  if (existing) {
    return {
      error: 'A patient profile already exists for this user',
      status: 409
    };
  }

  return {
    data: repository.create(data)
  };
};

const updatePatient = (id, data) => {
  const existing = repository.findById(id);

  if (!existing) {
    return {
      error: 'Patient not found',
      status: 404
    };
  }

  return {
    data: repository.update(id, data)
  };
};

const deletePatient = (id) => {
  const removed = repository.remove(id);

  if (!removed) {
    return {
      error: 'Patient not found',
      status: 404
    };
  }

  return { success: true };
};

module.exports = {
  getAllPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient
};