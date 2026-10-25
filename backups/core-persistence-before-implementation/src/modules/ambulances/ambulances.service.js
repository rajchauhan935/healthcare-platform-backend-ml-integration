const repository = require('./ambulances.repository');

const MANUAL_STATUSES = [
  'AVAILABLE',
  'OFFLINE',
  'MAINTENANCE'
];

const getAllAmbulances = () => repository.findAll();

const getAmbulanceById = id => repository.findById(id);

const getAvailableAmbulances = ({
  requiredEquipment = []
} = {}) => {
  return repository.findAvailable().filter(ambulance =>
    requiredEquipment.every(item =>
      ambulance.equipment.includes(item)
    )
  );
};

const updateAmbulanceStatus = (id, status) => {
  const ambulance = repository.findById(id);

  if (!ambulance) {
    return {
      success: false,
      statusCode: 404,
      message: 'Ambulance not found'
    };
  }

  if (!MANUAL_STATUSES.includes(status)) {
    return {
      success: false,
      statusCode: 400,
      message: 'This status is managed by the dispatch/trip workflow'
    };
  }

  if (
    ['RESERVED', 'BUSY'].includes(ambulance.status)
  ) {
    return {
      success: false,
      statusCode: 409,
      message: 'An ambulance assigned to an active dispatch cannot be manually changed'
    };
  }

  if (status === 'AVAILABLE') {
    const eligible = repository.findAvailable().some(
      item => item.id === ambulance.id
    );

    // An OFFLINE or MAINTENANCE vehicle may not be in the available
    // list yet, so check its underlying operational/crew conditions.
    const crew = repository.findCrewAssignmentById(
      ambulance.crewAssignmentId
    );

    const canBecomeAvailable =
      ambulance.isOperational &&
      crew &&
      crew.isActive &&
      crew.ambulanceId === ambulance.id;

    if (!eligible && !canBecomeAvailable) {
      return {
        success: false,
        statusCode: 409,
        message: 'Operational vehicle and active crew are required'
      };
    }
  }

  return {
    success: true,
    data: repository.updateStatus(id, status)
  };
};

module.exports = {
  getAllAmbulances,
  getAmbulanceById,
  getAvailableAmbulances,
  updateAmbulanceStatus
};