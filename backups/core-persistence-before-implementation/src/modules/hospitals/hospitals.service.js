const repository = require('./hospitals.repository');

const CAPACITY_FRESHNESS_MS = 5 * 60 * 1000;

const getCapacityStatus = capacity => {
  if (!capacity) {
    return {
      isFresh: false,
      availabilityConfirmed: false
    };
  }

  const updatedAt = Date.parse(capacity.updatedAt);

  const isFresh =
    Number.isFinite(updatedAt) &&
    updatedAt <= Date.now() &&
    Date.now() - updatedAt <= CAPACITY_FRESHNESS_MS;

  return {
    isFresh,
    availabilityConfirmed: isFresh
  };
};

const getAllHospitals = () => repository.findAll();

const getHospitalById = id => repository.findById(id);

const createHospital = data => repository.create(data);

const getHospitalCapacity = id => {
  const hospital = repository.findById(id);

  if (!hospital) return null;

  const capacity = repository.findCapacityByHospitalId(id);

  return {
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    capacity,
    ...getCapacityStatus(capacity)
  };
};

const updateHospitalCapacity = (id, data) => {
  const hospital = repository.findById(id);

  if (!hospital) return null;

  return repository.updateCapacity(id, data);
};

module.exports = {
  getAllHospitals,
  getHospitalById,
  createHospital,
  getHospitalCapacity,
  updateHospitalCapacity
};