const crypto = require('crypto');

const createDispatchRequestEntity = ({
  patientId,
  pickupLocation,
  emergencyType,
  description = null
}) => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    patientId,
    pickupLocation: {
      latitude: pickupLocation.latitude,
      longitude: pickupLocation.longitude
    },
    emergencyType,
    description,
    ambulanceId: null,
    status: 'REQUESTED',
    history: [
      {
        status: 'REQUESTED',
        timestamp: now,
        note: 'SOS request created'
      }
    ],
    createdAt: now,
    updatedAt: now
  };
};

module.exports = {
  createDispatchRequestEntity
};
