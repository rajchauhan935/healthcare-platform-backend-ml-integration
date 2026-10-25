'use strict';

const tripsRepository = require('./trips.repository');
const dispatchRepository = require('../dispatch/dispatch.repository');
const ambulanceRepository = require('../ambulances/ambulances.repository');

const { validateCreateTripDto } = require('./dto/create-trip.dto');
const { validateUpdateTripStatusDto } = require('./dto/update-trip-status.dto');

const {
  TRIP_STATUSES,
  assertTripTransition
} = require('./trip-policy.service');

const {
  EVENT_TYPES,
  publishEvent
} = require('../events/events.module');

const makeError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

/**
 * Publish an event after a successful in-memory state change.
 * This is best-effort delivery for the current prototype.
 * Production requires durable event storage / an outbox.
 */
const publishTripEvent = (eventType, payload) => {
  try {
    return publishEvent({
      eventType,
      source: 'trips',
      payload
    });
  } catch (error) {
    console.error(
      '[TRIP EVENT PUBLISH FAILURE]',
      JSON.stringify({
        eventType,
        message: error.message
      })
    );

    return null;
  }
};

/**
 * Publish events for one successful status transition.
 */
const publishTripStatusEvents = (previousStatus, updatedTrip) => {
  const payload = {
    tripId: updatedTrip.id,
    dispatchId: updatedTrip.dispatchId,
    patientId: updatedTrip.patientId,
    ambulanceId: updatedTrip.ambulanceId,
    hospitalId: updatedTrip.hospitalId,
    previousStatus,
    status: updatedTrip.status
  };

  // Every successful transition produces this event.
  publishTripEvent(
    EVENT_TYPES.TRIP_STATUS_CHANGED,
    payload
  );

  // This event specifically represents arrival at the hospital.
  if (updatedTrip.status === TRIP_STATUSES.ARRIVED_AT_HOSPITAL) {
    publishTripEvent(
      EVENT_TYPES.AMBULANCE_ARRIVED,
      {
        tripId: updatedTrip.id,
        dispatchId: updatedTrip.dispatchId,
        patientId: updatedTrip.patientId,
        ambulanceId: updatedTrip.ambulanceId,
        hospitalId: updatedTrip.hospitalId,
        arrivalType: 'HOSPITAL',
        status: updatedTrip.status,
        arrivedAt: updatedTrip.arrivedAt
      }
    );
  }
};

/**
 * Ensure that the user has staff access.
 */
const assertStaff = (user) => {
  if (!user || !['ADMIN', 'DISPATCHER'].includes(user.role)) {
    throw makeError(
      403,
      'Staff access is required'
    );
  }
};

/**
 * Check whether a user is allowed to view a trip.
 */
const canViewTrip = (trip, user) => {
  if (!user) {
    return false;
  }

  if (['ADMIN', 'DISPATCHER'].includes(user.role)) {
    return true;
  }

  return (
    user.role === 'PATIENT' &&
    String(trip.patientId) === String(user.id)
  );
};

/**
 * Get a trip by its ID.
 */
const getTrip = (id, user) => {
  const trip = tripsRepository.findById(id);

  if (!trip) {
    throw makeError(
      404,
      'Trip not found'
    );
  }

  if (!canViewTrip(trip, user)) {
    throw makeError(
      403,
      'You cannot access this trip'
    );
  }

  return trip;
};

/**
 * Get a trip by its dispatch ID.
 */
const getTripByDispatchId = (dispatchId, user) => {
  const trip = tripsRepository.findByDispatchId(dispatchId);

  if (!trip) {
    throw makeError(
      404,
      'Trip not found for this dispatch'
    );
  }

  if (!canViewTrip(trip, user)) {
    throw makeError(
      403,
      'You cannot access this trip'
    );
  }

  return trip;
};

/**
 * Create a trip for an assigned dispatch.
 */
const createTrip = (body, user) => {
  assertStaff(user);

  const payload = validateCreateTripDto(body);

  const dispatch = dispatchRepository.findById(
    payload.dispatchId
  );

  if (!dispatch) {
    throw makeError(
      404,
      'Dispatch request not found'
    );
  }

  if (
    dispatch.status !== 'ASSIGNED' ||
    dispatch.ambulanceId == null
  ) {
    throw makeError(
      409,
      'A trip requires an ASSIGNED dispatch with an ambulance'
    );
  }

  if (tripsRepository.findByDispatchId(dispatch.id)) {
    throw makeError(
      409,
      'A trip already exists for this dispatch'
    );
  }

  const ambulance = ambulanceRepository.findById(
    dispatch.ambulanceId
  );

  if (!ambulance) {
    throw makeError(
      404,
      'Assigned ambulance not found'
    );
  }

  if (ambulance.status !== 'RESERVED') {
    throw makeError(
      409,
      'The assigned ambulance must be RESERVED'
    );
  }

  // hospitalId remains an optional reference in this prototype.
  // No event is emitted because the event catalogue does not
  // define TRIP_CREATED.
  return tripsRepository.create({
    dispatchId: dispatch.id,
    patientId: dispatch.patientId,
    ambulanceId: ambulance.id,
    hospitalId: payload.hospitalId,
    createdBy: user.id
  });
};

/**
 * Update the trip lifecycle.
 *
 * options.publishEvents is an internal option used by cancelTrip()
 * to defer publication until the cancellation reason is saved.
 *
 * Existing controller calls remain unchanged.
 */
const updateTripStatus = (id, body, user, options = {}) => {
  assertStaff(user);

  const { status } = validateUpdateTripStatusDto(body);

  const trip = tripsRepository.findById(id);

  if (!trip) {
    throw makeError(
      404,
      'Trip not found'
    );
  }

  assertTripTransition(
    trip.status,
    status
  );

  const ambulance = ambulanceRepository.findById(
    trip.ambulanceId
  );

  if (!ambulance) {
    throw makeError(
      404,
      'Trip ambulance not found'
    );
  }

  if (status === TRIP_STATUSES.EN_ROUTE_TO_PICKUP) {
    if (ambulance.status !== 'RESERVED') {
      throw makeError(
        409,
        'The trip ambulance must be RESERVED before departure'
      );
    }
  } else if (
    status !== TRIP_STATUSES.CANCELLED &&
    ambulance.status !== 'BUSY'
  ) {
    throw makeError(
      409,
      'The trip ambulance must be BUSY'
    );
  }

  if (status === TRIP_STATUSES.COMPLETED) {
    if (ambulance.status !== 'BUSY') {
      throw makeError(
        409,
        'Only a BUSY ambulance can complete its trip'
      );
    }
  }

  if (status === TRIP_STATUSES.CANCELLED) {
    const expectedStatus =
      trip.status === TRIP_STATUSES.CREATED
        ? 'RESERVED'
        : 'BUSY';

    if (ambulance.status !== expectedStatus) {
      throw makeError(
        409,
        `The trip ambulance must be ${expectedStatus} to cancel`
      );
    }
  }

  const previousStatus = trip.status;
  const now = new Date().toISOString();

  const changes = {
    status,
    history: [
      ...trip.history,
      {
        status,
        timestamp: now,
        actorId: user.id,
        note: `Trip status changed to ${status}`
      }
    ]
  };

  if (status === TRIP_STATUSES.EN_ROUTE_TO_PICKUP) {
    changes.startedAt = now;
  }

  if (status === TRIP_STATUSES.PATIENT_PICKED_UP) {
    changes.pickedUpAt = now;
  }

  if (status === TRIP_STATUSES.ARRIVED_AT_HOSPITAL) {
    changes.arrivedAt = now;
  }

  if (status === TRIP_STATUSES.COMPLETED) {
    changes.completedAt = now;
  }

  if (status === TRIP_STATUSES.CANCELLED) {
    changes.cancelledAt = now;
  }

  // Preserve the existing in-memory ambulance lifecycle.
  if (status === TRIP_STATUSES.EN_ROUTE_TO_PICKUP) {
    ambulanceRepository.updateStatus(
      ambulance.id,
      'BUSY'
    );
  }

  if (
    status === TRIP_STATUSES.COMPLETED ||
    status === TRIP_STATUSES.CANCELLED
  ) {
    ambulanceRepository.updateStatus(
      ambulance.id,
      'AVAILABLE'
    );
  }

  const updatedTrip = tripsRepository.update(
    id,
    changes
  );

  // Normal status updates publish immediately after saving.
  // Cancellation via cancelTrip() defers publication.
  if (options.publishEvents !== false) {
    publishTripStatusEvents(
      previousStatus,
      updatedTrip
    );
  }

  return updatedTrip;
};

/**
 * Cancel a trip and save the cancellation reason.
 */
const cancelTrip = (id, reason, user) => {
  assertStaff(user);

  if (
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.length > 500
  ) {
    throw makeError(
      400,
      'Cancellation reason is required (maximum 500 characters)'
    );
  }

  const trip = tripsRepository.findById(id);

  if (!trip) {
    throw makeError(
      404,
      'Trip not found'
    );
  }

  assertTripTransition(
    trip.status,
    TRIP_STATUSES.CANCELLED
  );

  const previousStatus = trip.status;

  // Defer event publishing until the reason has been saved.
  const updated = updateTripStatus(
    id,
    {
      status: TRIP_STATUSES.CANCELLED
    },
    user,
    {
      publishEvents: false
    }
  );

  const finalTrip = tripsRepository.update(
    id,
    {
      cancellationReason: reason.trim(),
      history: [
        ...updated.history.slice(0, -1),
        {
          ...updated.history[
            updated.history.length - 1
          ],
          reason: reason.trim()
        }
      ]
    }
  );

  publishTripStatusEvents(
    previousStatus,
    finalTrip
  );

  return finalTrip;
};

/**
 * Export trip service functions.
 */
module.exports = {
  createTrip,
  getTrip,
  getTripByDispatchId,
  updateTripStatus,
  cancelTrip
};
