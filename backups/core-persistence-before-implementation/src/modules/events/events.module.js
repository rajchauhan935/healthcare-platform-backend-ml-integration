'use strict';

const {
  EVENT_TYPES,
  isValidEventType
} = require('./event-types');

const {
  createEventEnvelope
} = require('./event-envelope');

const {
  publishEvent,
  getEventBus
} = require('./event-publisher.service');

const {
  subscribeToEvent,
  subscribeToEvents
} = require('./event-consumer.service');

/**
 * Central interface for the Events module.
 *
 * This module is a shared service, not an HTTP router.
 *
 * Other backend modules can import:
 *
 * const {
 *   EVENT_TYPES,
 *   publishEvent,
 *   subscribeToEvent
 * } = require('../events/events.module');
 *
 * No app.use() registration is needed.
 */
module.exports = {
  EVENT_TYPES,
  isValidEventType,
  createEventEnvelope,
  publishEvent,
  subscribeToEvent,
  subscribeToEvents,
  getEventBus
};
