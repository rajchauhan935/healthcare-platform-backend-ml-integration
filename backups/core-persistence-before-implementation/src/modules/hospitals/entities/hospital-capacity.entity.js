const createHospitalCapacityEntity = ({
  hospitalId,
  availableBeds,
  availableIcuBeds,
  availableVentilators,
  updatedAt = new Date().toISOString()
}) => ({
  hospitalId,
  availableBeds,
  availableIcuBeds,
  availableVentilators,
  updatedAt
});

module.exports = {
  createHospitalCapacityEntity
};