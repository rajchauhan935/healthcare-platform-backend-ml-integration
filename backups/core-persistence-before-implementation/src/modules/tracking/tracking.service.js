'use strict';

const tripsRepository = require(
  '../trips/trips.repository'
);

const {
  validateLocationUpdate
} = require('./dto/location-update.dto');

const {
  EVENT_TYPES,
  publishEvent
} = require('../events/events.module');

// Prototype-only in-memory location storage.
// Database integration will be handled by the database team.
const latestLocations = new Map();

const STAFF_ROLES = [
  'ADMIN',
  'DISPATCHER'
];

const ACTIVE_TRIP_STATUSES = [
  'CREATED',
  'EN_ROUTE_TO_PICKUP',
  'PATIENT_PICKED_UP',
  'EN_ROUTE_TO_HOSPITAL',
  'ARRIVED_AT_HOSPITAL'
];

const isStaff = user =>
  Boolean(
    user &&
    STAFF_ROLES.includes(user.role)
  );

/**
 * Publish an event after a successful GPS state change.
 *
 * Best-effort in-memory event delivery only.
 * Production requires durable event delivery / an outbox.
 */
const publishLocationEvent = (trip, location) => {
  try {
    return publishEvent({
      eventType: EVENT_TYPES.LOCATION_UPDATED,
      source: 'tracking',
      payload: {
        tripId: trip.id,
        dispatchId: trip.dispatchId,
        patientId: trip.patientId,
        ambulanceId: trip.ambulanceId,
        tripStatus: trip.status,
        timestamp: location.timestamp,
        receivedAt: location.receivedAt
      }
    });
  } catch (error) {
    // The GPS reading has already been accepted and saved.
    // Do not misreport that successful state change as a
    // failed HTTP request.
    console.error(
      '[TRACKING EVENT PUBLISH FAILURE]',
      JSON.stringify({
        eventType: EVENT_TYPES.LOCATION_UPDATED,
        message: error.message
      })
    );

    return null;
  }
};

const updateLocation = (tripId, body, user) => {
  if (!isStaff(user)) {
    return {
      success: false,
      statusCode: 403,
      message: 'You are not authorized to update trip location'
    };
  }

  const trip = tripsRepository.findById(tripId);

  if (!trip) {
    return {
      success: false,
      statusCode: 404,
      message: 'Trip not found'
    };
  }

  if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) {
    return {
      success: false,
      statusCode: 409,
      message: 'Location updates are not allowed for this trip status'
    };
  }

  const validation = validateLocationUpdate(body);

  if (!validation.success) {
    return {
      success: false,
      statusCode: 400,
      message: validation.message
    };
  }

  const incoming = validation.data;
  const incomingTime = Date.parse(incoming.timestamp);
  const now = Date.now();

  // Reject timestamps more than 30 seconds in the future.
  if (incomingTime > now + 30000) {
    return {
      success: false,
      statusCode: 400,
      message: 'GPS timestamp is too far in the future'
    };
  }

  // Prototype policy: reject readings older than 60 seconds.
  if (incomingTime < now - 60000) {
    return {
      success: false,
      statusCode: 409,
      message: 'GPS update is too old'
    };
  }

  const previous = latestLocations.get(tripId);

  if (
    previous &&
    incomingTime <= Date.parse(previous.timestamp)
  ) {
    return {
      success: false,
      statusCode: 409,
      message: 'Stale or duplicate GPS timestamp'
    };
  }

  const saved = {
    tripId: trip.id,
    latitude: incoming.latitude,
    longitude: incoming.longitude,
    timestamp: incoming.timestamp,
    receivedAt: new Date().toISOString()
  };

  // Save first. Publish only after successful acceptance.
  latestLocations.set(tripId, saved);

  publishLocationEvent(trip, saved);

  // Preserve the existing REST service response contract.
  return {
    success: true,
    statusCode: 200,
    message: 'Trip location updated successfully',
    data: { ...saved }
  };
};

const getLatestLocation = (tripId, user) => {
  if (!user) {
    return {
      success: false,
      statusCode: 401,
      message: 'Authentication is required'
    };
  }

  const trip = tripsRepository.findById(tripId);

  if (!trip) {
    return {
      success: false,
      statusCode: 404,
      message: 'Trip not found'
    };
  }

  const isOwner =
    user.role === 'PATIENT' &&
    String(trip.patientId) === String(user.id);

  if (!isStaff(user) && !isOwner) {
    return {
      success: false,
      statusCode: 403,
      message: 'You are not authorized to track this trip'
    };
  }

  const location = latestLocations.get(tripId) || null;

  return {
    success: true,
    statusCode: 200,
    data: {
      tripId: trip.id,
      tripStatus: trip.status,
      ambulanceId: trip.ambulanceId,
      location: location ? { ...location } : null
    }
  };
};

module.exports = {
  updateLocation,
  getLatestLocation
};
