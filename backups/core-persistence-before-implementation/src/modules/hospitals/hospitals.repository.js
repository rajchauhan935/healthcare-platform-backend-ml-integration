const {
  createHospitalEntity
} = require('./entities/hospital.entity');

const {
  createHospitalCapacityEntity
} = require('./entities/hospital-capacity.entity');

const hospitals = [
  createHospitalEntity({
    id: 1,
    name: 'Demo City Hospital',
    address: 'Fictional Demo Address A',
    latitude: 26.9124,
    longitude: 75.7873,
    paymentTiers: ['SELF_PAY', 'INSURANCE']
  }),

  createHospitalEntity({
    id: 2,
    name: 'Demo Emergency Hospital',
    address: 'Fictional Demo Address B',
    latitude: 26.9200,
    longitude: 75.8000,
    paymentTiers: ['SELF_PAY']
  })
];

const capacities = [
  createHospitalCapacityEntity({
    hospitalId: 1,
    availableBeds: 15,
    availableIcuBeds: 3,
    availableVentilators: 2
  }),

  createHospitalCapacityEntity({
    hospitalId: 2,
    availableBeds: 0,
    availableIcuBeds: 0,
    availableVentilators: 0
  })
];

const findAll = () => hospitals;

const findById = id =>
  hospitals.find(hospital => hospital.id === Number(id));

const findCapacityByHospitalId = hospitalId =>
  capacities.find(
    capacity => capacity.hospitalId === Number(hospitalId)
  );

const create = data => {
  const nextId = Math.max(0, ...hospitals.map(h => h.id)) + 1;

  const hospital = createHospitalEntity({
    id: nextId,
    ...data
  });

  hospitals.push(hospital);

  capacities.push(
    createHospitalCapacityEntity({
      hospitalId: nextId,
      availableBeds: 0,
      availableIcuBeds: 0,
      availableVentilators: 0
    })
  );

  return hospital;
};

const updateCapacity = (hospitalId, data) => {
  const capacity = findCapacityByHospitalId(hospitalId);

  if (!capacity) return null;

  capacity.availableBeds = data.availableBeds;
  capacity.availableIcuBeds = data.availableIcuBeds;
  capacity.availableVentilators = data.availableVentilators;
  capacity.updatedAt = new Date().toISOString();

  return capacity;
};

module.exports = {
  findAll,
  findById,
  findCapacityByHospitalId,
  create,
  updateCapacity
};