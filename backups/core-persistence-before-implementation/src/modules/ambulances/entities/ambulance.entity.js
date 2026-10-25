const AMBULANCE_STATUSES = Object.freeze([
  'AVAILABLE',
  'RESERVED',
  'BUSY',
  'OFFLINE',
  'MAINTENANCE'
]);

const createAmbulanceEntity = ({
  id,
  vehicleNumber,
  type = 'BASIC',
  status = 'AVAILABLE',
  equipment = [],
  latitude,
  longitude,
  isOperational = true,
  crewAssignmentId = null
}) => ({
  id,
  vehicleNumber,
  type,
  status,
  equipment,
  latitude,
  longitude,
  isOperational,
  crewAssignmentId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

module.exports = {
  AMBULANCE_STATUSES,
  createAmbulanceEntity
};