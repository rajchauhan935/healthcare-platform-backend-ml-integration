const crypto = require('crypto');

// Temporary storage for local development only.
// Data resets whenever the Node.js server restarts.
const dispatches = new Map();
const idempotencyKeys = new Map();

const create = (data) => {
  const id = crypto.randomUUID();

  const dispatch = {
    id,
    patientId: data.patientId,
    pickupLocation: data.pickupLocation,
    emergencyType: data.emergencyType,
    description: data.description || null,
    status: 'REQUESTED',
    ambulanceId: null,
    hospitalId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [
      {
        status: 'REQUESTED',
        timestamp: new Date().toISOString(),
        note: 'SOS request created'
      }
    ]
  };

  dispatches.set(id, dispatch);

  return dispatch;
};

const findById = (id) => {
  return dispatches.get(id) || null;
};

const findAll = () => {
  return Array.from(dispatches.values());
};

const update = (id, changes) => {
  const existing = dispatches.get(id);

  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    ...changes,
    id: existing.id,
    updatedAt: new Date().toISOString()
  };

  dispatches.set(id, updated);

  return updated;
};

const findByIdempotencyKey = (patientId, key) => {
  return idempotencyKeys.get(`${patientId}:${key}`) || null;
};

const saveIdempotencyKey = (patientId, key, record) => {
  idempotencyKeys.set(`${patientId}:${key}`, record);
};

module.exports = {
  create,
  findById,
  findAll,
  update,
  findByIdempotencyKey,
  saveIdempotencyKey
};
