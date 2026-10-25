'use strict';

const { randomUUID } = require('node:crypto');

const {
  isValidEventType
} = require('./event-types');

/**
 * Creates a consistent envelope for backend domain events.
 *
 * Every event contains:
 * - eventId: unique identifier
 * - eventType: supported domain event name
 * - timestamp: UTC ISO 8601 timestamp
 * - source: module that published the event
 * - payload: event-specific information
 */
const createEventEnvelope = ({
  eventType,
  source,
  payload
}) => {
  // Validate the event type.
  if (!isValidEventType(eventType)) {
    throw new Error(
      'A supported eventType is required'
    );
  }

  // Validate the publishing module.
  if (
    typeof source !== 'string' ||
    !source.trim() ||
    source.length > 100
  ) {
    throw new Error(
      'source must be a non-empty string of at most 100 characters'
    );
  }

  // Require a plain JSON-compatible object as the payload.
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error(
      'payload must be a valid object'
    );
  }

  // Prevent undefined, functions, circular references,
  // and other non-JSON-compatible event payloads.
  let safePayload;

  try {
    const serialized = JSON.stringify(payload);

    if (typeof serialized !== 'string') {
      throw new Error('Payload cannot be serialized');
    }

    safePayload = JSON.parse(serialized);
  } catch {
    throw new Error(
      'payload must be JSON-serializable'
    );
  }

  return Object.freeze({
    eventId: randomUUID(),
    eventType,
    timestamp: new Date().toISOString(),
    source: source.trim(),
    payload: Object.freeze(safePayload)
  });
};

module.exports = {
  createEventEnvelope
};
