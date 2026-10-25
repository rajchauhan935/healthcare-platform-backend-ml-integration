const TRIP_STATUSES = Object.freeze({
  CREATED: 'CREATED',
  EN_ROUTE_TO_PICKUP: 'EN_ROUTE_TO_PICKUP',
  PATIENT_PICKED_UP: 'PATIENT_PICKED_UP',
  EN_ROUTE_TO_HOSPITAL: 'EN_ROUTE_TO_HOSPITAL',
  ARRIVED_AT_HOSPITAL: 'ARRIVED_AT_HOSPITAL',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  CREATED: [
    TRIP_STATUSES.EN_ROUTE_TO_PICKUP,
    TRIP_STATUSES.CANCELLED
  ],
  EN_ROUTE_TO_PICKUP: [
    TRIP_STATUSES.PATIENT_PICKED_UP,
    TRIP_STATUSES.CANCELLED
  ],
  PATIENT_PICKED_UP: [
    TRIP_STATUSES.EN_ROUTE_TO_HOSPITAL
  ],
  EN_ROUTE_TO_HOSPITAL: [
    TRIP_STATUSES.ARRIVED_AT_HOSPITAL
  ],
  ARRIVED_AT_HOSPITAL: [
    TRIP_STATUSES.COMPLETED
  ],
  COMPLETED: [],
  CANCELLED: []
});

const assertTripTransition = (fromStatus, toStatus) => {
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];

  if (!allowed.includes(toStatus)) {
    const error = new Error(
      `Invalid trip transition: ${fromStatus} -> ${toStatus}`
    );
    error.statusCode = 409;
    throw error;
  }

  return true;
};

module.exports = {
  TRIP_STATUSES,
  ALLOWED_TRANSITIONS,
  assertTripTransition
};
