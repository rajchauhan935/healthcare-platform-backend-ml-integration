'use strict';

const crypto = require('node:crypto');

const repository = require('./dispatch.repository');

const ambulanceRepository = require(
  '../ambulances/ambulances.repository'
);

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
 * Publish a domain event after a successful state change.
 *
 * Event delivery is currently in-memory and best-effort.
 * If publishing fails, the successful Dispatch operation
 * must not be reported as an unsuccessful HTTP request,
 * because its state has already changed.
 *
 * Production will need a durable transactional outbox.
 */
const publishDispatchEvent = (eventType, payload) => {
  try {
    return publishEvent({
      eventType,
      source: 'dispatch',
      payload
    });
  } catch (error) {
    console.error(
      '[DISPATCH EVENT PUBLISH FAILURE]',
      JSON.stringify({
        eventType,
        message: error.message
      })
    );

    return null;
  }
};

/**
 * Validate and normalize the SOS request body.
 */
const normalizePayload = body => {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw makeError(
      400,
      'A valid JSON request body is required'
    );
  }

  const {
    pickupLocation,
    emergencyType,
    description
  } = body;

  if (
    !pickupLocation ||
    typeof pickupLocation !== 'object' ||
    Array.isArray(pickupLocation) ||
    typeof pickupLocation.latitude !== 'number' ||
    typeof pickupLocation.longitude !== 'number' ||
    !Number.isFinite(pickupLocation.latitude) ||
    !Number.isFinite(pickupLocation.longitude) ||
    pickupLocation.latitude < -90 ||
    pickupLocation.latitude > 90 ||
    pickupLocation.longitude < -180 ||
    pickupLocation.longitude > 180
  ) {
    throw makeError(
      400,
      'pickupLocation must contain valid numeric latitude and longitude'
    );
  }

  if (
    typeof emergencyType !== 'string' ||
    !emergencyType.trim() ||
    emergencyType.length > 100
  ) {
    throw makeError(
      400,
      'A valid emergencyType is required (maximum 100 characters)'
    );
  }

  if (
    description !== undefined &&
    description !== null &&
    (
      typeof description !== 'string' ||
      description.length > 1000
    )
  ) {
    throw makeError(
      400,
      'description must be a string of at most 1000 characters'
    );
  }

  return {
    pickupLocation: {
      latitude: pickupLocation.latitude,
      longitude: pickupLocation.longitude
    },
    emergencyType: emergencyType.trim(),
    description: description
      ? description.trim()
      : null
  };
};

/**
 * Create a fictional SOS request.
 *
 * Reusing the same idempotency key with the same payload
 * returns the original dispatch without creating a new event.
 */
const createSos = (patientId, body, idempotencyKey) => {
  if (!patientId) {
    throw makeError(
      401,
      'Authentication is required'
    );
  }

  if (
    typeof idempotencyKey !== 'string' ||
    !idempotencyKey.trim() ||
    idempotencyKey.length > 128
  ) {
    throw makeError(
      400,
      'Idempotency-Key header is required (maximum 128 characters)'
    );
  }

  const payload = normalizePayload(body);
  const key = idempotencyKey.trim();

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');

  const existing = repository.findByIdempotencyKey(
    patientId,
    key
  );

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw makeError(
        409,
        'This Idempotency-Key was already used with a different SOS request'
      );
    }

    return {
      created: false,
      dispatch: repository.findById(
        existing.dispatchId
      )
    };
  }

  // Save the dispatch first.
  const dispatch = repository.create({
    patientId,
    ...payload
  });

  repository.saveIdempotencyKey(
    patientId,
    key,
    {
      dispatchId: dispatch.id,
      fingerprint
    }
  );

  // Publish only for a genuinely new SOS.
  publishDispatchEvent(
    EVENT_TYPES.SOS_CREATED,
    {
      dispatchId: dispatch.id,
      patientId: dispatch.patientId,
      status: dispatch.status
    }
  );

  return {
    created: true,
    dispatch
  };
};

/**
 * Retrieve a dispatch with ownership checks.
 */
const getDispatch = (id, user) => {
  const dispatch = repository.findById(id);

  if (!dispatch) {
    throw makeError(
      404,
      'Dispatch request not found'
    );
  }

  if (!user) {
    throw makeError(
      401,
      'Authentication is required'
    );
  }

  const isStaff = [
    'ADMIN',
    'DISPATCHER'
  ].includes(user.role);

  if (
    !isStaff &&
    String(dispatch.patientId) !== String(user.id)
  ) {
    throw makeError(
      403,
      'You cannot access this dispatch request'
    );
  }

  return dispatch;
};

/**
 * Validate ambulance eligibility before assignment.
 */
const requireAvailableAmbulance = ambulanceId => {
  const ambulance = ambulanceRepository.findById(
    ambulanceId
  );

  if (!ambulance) {
    throw makeError(
      404,
      'Ambulance not found'
    );
  }

  const isAvailable = ambulanceRepository
    .findAvailable()
    .some(item => item.id === ambulance.id);

  if (!isAvailable) {
    throw makeError(
      409,
      'Ambulance is not available or does not have an active crew'
    );
  }

  return ambulance;
};

/**
 * Assign an ambulance to a REQUESTED dispatch.
 */
const assignAmbulance = (
  dispatchId,
  ambulanceId,
  user
) => {
  const dispatch = repository.findById(dispatchId);

  if (!dispatch) {
    throw makeError(
      404,
      'Dispatch request not found'
    );
  }

  if (dispatch.status !== 'REQUESTED') {
    throw makeError(
      409,
      'Only a REQUESTED dispatch can receive its first assignment'
    );
  }

  const ambulance = requireAvailableAmbulance(
    ambulanceId
  );

  const now = new Date().toISOString();

  // Preserve existing in-memory assignment behavior.
  ambulanceRepository.updateStatus(
    ambulance.id,
    'RESERVED'
  );

  const updatedDispatch = repository.update(
    dispatchId,
    {
      ambulanceId: ambulance.id,
      status: 'ASSIGNED',
      history: [
        ...dispatch.history,
        {
          status: 'ASSIGNED',
          timestamp: now,
          note: 'Ambulance assigned',
          ambulanceId: ambulance.id,
          actorId: user.id
        }
      ]
    }
  );

  // Publish only after the assignment succeeds.
  publishDispatchEvent(
    EVENT_TYPES.AMBULANCE_ASSIGNED,
    {
      dispatchId: updatedDispatch.id,
      patientId: updatedDispatch.patientId,
      ambulanceId: updatedDispatch.ambulanceId,
      status: updatedDispatch.status,
      reassigned: false
    }
  );

  return updatedDispatch;
};

/**
 * Replace the RESERVED ambulance on an ASSIGNED dispatch.
 */
const reassignAmbulance = (
  dispatchId,
  newAmbulanceId,
  reason,
  user
) => {
  const dispatch = repository.findById(dispatchId);

  if (!dispatch) {
    throw makeError(
      404,
      'Dispatch request not found'
    );
  }

  if (
    dispatch.status !== 'ASSIGNED' ||
    dispatch.ambulanceId === null
  ) {
    throw makeError(
      409,
      'Only an ASSIGNED dispatch can be reassigned'
    );
  }

  if (
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.length > 500
  ) {
    throw makeError(
      400,
      'A reassignment reason is required (maximum 500 characters)'
    );
  }

  const oldAmbulance = ambulanceRepository.findById(
    dispatch.ambulanceId
  );

  if (
    !oldAmbulance ||
    oldAmbulance.status !== 'RESERVED'
  ) {
    throw makeError(
      409,
      'The existing ambulance is not in the expected RESERVED state'
    );
  }

  if (
    Number(newAmbulanceId) === oldAmbulance.id
  ) {
    throw makeError(
      409,
      'The replacement ambulance must be different'
    );
  }

  // Validate replacement before modifying existing state.
  const newAmbulance = requireAvailableAmbulance(
    newAmbulanceId
  );

  const now = new Date().toISOString();

  // Preserve existing synchronous in-memory operations.
  ambulanceRepository.updateStatus(
    newAmbulance.id,
    'RESERVED'
  );

  ambulanceRepository.updateStatus(
    oldAmbulance.id,
    'AVAILABLE'
  );

  const updatedDispatch = repository.update(
    dispatchId,
    {
      ambulanceId: newAmbulance.id,
      history: [
        ...dispatch.history,
        {
          status: 'ASSIGNED',
          timestamp: now,
          note: 'Ambulance reassigned',
          previousAmbulanceId: oldAmbulance.id,
          ambulanceId: newAmbulance.id,
          reason: reason.trim(),
          actorId: user.id
        }
      ]
    }
  );

  // Reuse the existing event type.
  // No additional event type is necessary.
  publishDispatchEvent(
    EVENT_TYPES.AMBULANCE_ASSIGNED,
    {
      dispatchId: updatedDispatch.id,
      patientId: updatedDispatch.patientId,
      ambulanceId: newAmbulance.id,
      previousAmbulanceId: oldAmbulance.id,
      status: updatedDispatch.status,
      reassigned: true
    }
  );

  return updatedDispatch;
};

module.exports = {
  createSos,
  getDispatch,
  assignAmbulance,
  reassignAmbulance,
  makeError
};
