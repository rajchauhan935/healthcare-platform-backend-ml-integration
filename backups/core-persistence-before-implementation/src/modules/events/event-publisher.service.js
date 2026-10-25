'use strict';

const { EventEmitter } = require('node:events');

const {
  createEventEnvelope
} = require('./event-envelope');

/**
 * Shared in-memory event bus.
 *
 * All modules importing this file receive the same EventEmitter
 * instance because Node.js caches CommonJS modules.
 *
 * Prototype limitation:
 * Events are not persisted and are not shared between processes.
 */
const eventBus = new EventEmitter();

// Prevent silent unbounded growth in event listeners.
// This is a diagnostic threshold, not a subscriber limit.
eventBus.setMaxListeners(30);

/**
 * Publish a validated domain event.
 *
 * Example:
 *
 * publishEvent({
 *   eventType: 'SOS_CREATED',
 *   source: 'dispatch',
 *   payload: {
 *     dispatchId: 'example-id',
 *     patientId: 1
 *   }
 * });
 *
 * @param {object} eventData
 * @returns {object} The generated event envelope
 */
const publishEvent = (eventData) => {
  const envelope = createEventEnvelope(eventData);

  // Deliver the event to subscribers synchronously.
  eventBus.emit(envelope.eventType, envelope);

  return envelope;
};

/**
 * Expose the shared event bus for the consumer service.
 * Other application modules should normally use publishEvent()
 * rather than calling eventBus.emit() directly.
 */
const getEventBus = () => eventBus;

module.exports = {
  publishEvent,
  getEventBus
};
