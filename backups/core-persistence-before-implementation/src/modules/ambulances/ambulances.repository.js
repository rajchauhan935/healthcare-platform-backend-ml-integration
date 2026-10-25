const {
  createAmbulanceEntity
} = require('./entities/ambulance.entity');

const {
  createCrewAssignmentEntity
} = require('./entities/crew-assignment.entity');

const ambulances = [
  createAmbulanceEntity({
    id: 1,
    vehicleNumber: 'DEMO-AMB-001',
    type: 'ADVANCED',
    status: 'AVAILABLE',
    equipment: ['OXYGEN', 'VENTILATOR', 'MONITOR'],
    latitude: 26.9124,
    longitude: 75.7873,
    crewAssignmentId: 1
  }),

  createAmbulanceEntity({
    id: 2,
    vehicleNumber: 'DEMO-AMB-002',
    type: 'BASIC',
    status: 'AVAILABLE',
    equipment: ['OXYGEN', 'FIRST_AID'],
    latitude: 26.9200,
    longitude: 75.8000,
    crewAssignmentId: 2
  }),

  createAmbulanceEntity({
    id: 3,
    vehicleNumber: 'DEMO-AMB-003',
    type: 'ADVANCED',
    status: 'MAINTENANCE',
    equipment: ['OXYGEN', 'VENTILATOR'],
    latitude: 26.9300,
    longitude: 75.8100,
    isOperational: false,
    crewAssignmentId: null
  })
];

const crewAssignments = [
  createCrewAssignmentEntity({
    id: 1,
    ambulanceId: 1,
    driverId: 'DEMO-DRIVER-001',
    paramedicId: 'DEMO-PARAMEDIC-001'
  }),

  createCrewAssignmentEntity({
    id: 2,
    ambulanceId: 2,
    driverId: 'DEMO-DRIVER-002',
    paramedicId: 'DEMO-PARAMEDIC-002'
  })
];

const findAll = () => ambulances;

const findById = id =>
  ambulances.find(ambulance => ambulance.id === Number(id));

const findCrewAssignmentById = id =>
  crewAssignments.find(assignment => assignment.id === Number(id));

const findAvailable = () =>
  ambulances.filter(ambulance => {
    if (
      ambulance.status !== 'AVAILABLE' ||
      !ambulance.isOperational ||
      ambulance.crewAssignmentId === null
    ) {
      return false;
    }

    const crew = findCrewAssignmentById(ambulance.crewAssignmentId);

    return Boolean(
      crew &&
      crew.isActive &&
      crew.ambulanceId === ambulance.id
    );
  });

const updateStatus = (id, status) => {
  const ambulance = findById(id);

  if (!ambulance) return null;

  ambulance.status = status;
  ambulance.updatedAt = new Date().toISOString();

  return ambulance;
};

module.exports = {
  findAll,
  findById,
  findAvailable,
  findCrewAssignmentById,
  updateStatus
};