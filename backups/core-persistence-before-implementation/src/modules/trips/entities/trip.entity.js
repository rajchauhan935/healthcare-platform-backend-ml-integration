const crypto = require('crypto');

const createTripEntity = ({
  dispatchId,
  patientId,
  ambulanceId,
  hospitalId = null,
  createdBy
}) => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    dispatchId,
    patientId,
    ambulanceId,
    hospitalId,
    status: 'CREATED',
    createdBy,
    startedAt: null,
    pickedUpAt: null,
    arrivedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    history: [
      {
        status: 'CREATED',
        timestamp: now,
        actorId: createdBy,
        note: 'Trip created from assigned dispatch'
      }
    ],
    createdAt: now,
    updatedAt: now
  };
};

module.exports = {
  createTripEntity
};
