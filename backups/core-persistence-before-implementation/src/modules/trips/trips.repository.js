const {
  createTripEntity
} = require('./entities/trip.entity');

const trips = new Map();
const tripByDispatchId = new Map();

const create = (data) => {
  if (tripByDispatchId.has(data.dispatchId)) {
    const error = new Error(
      'A trip already exists for this dispatch'
    );
    error.statusCode = 409;
    throw error;
  }

  const trip = createTripEntity(data);

  trips.set(trip.id, trip);
  tripByDispatchId.set(trip.dispatchId, trip.id);

  return trip;
};

const findById = (id) => trips.get(id) || null;

const findByDispatchId = (dispatchId) => {
  const id = tripByDispatchId.get(dispatchId);
  return id ? findById(id) : null;
};

const findAll = () => Array.from(trips.values());

const update = (id, changes) => {
  const existing = findById(id);

  if (!existing) return null;

  // Prevent changes to the trip's identity and immutable links.
  const {
    id: ignoredId,
    dispatchId: ignoredDispatchId,
    patientId: ignoredPatientId,
    ambulanceId: ignoredAmbulanceId,
    createdAt: ignoredCreatedAt,
    ...allowedChanges
  } = changes;

  const updated = {
    ...existing,
    ...allowedChanges,
    id: existing.id,
    dispatchId: existing.dispatchId,
    patientId: existing.patientId,
    ambulanceId: existing.ambulanceId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };

  trips.set(id, updated);
  return updated;
};

module.exports = {
  create,
  findById,
  findByDispatchId,
  findAll,
  update
};
