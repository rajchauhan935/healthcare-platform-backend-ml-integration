'use strict';

const {
  getEventBus
} = require('./event-publisher.service');

const {
  isValidEventType
} = require('./event-types');

/**
 * Register a consumer for one supported domain event.
 *
 * Returns an unsubscribe function.
 *
 * Example:
 * const unsubscribe = subscribeToEvent(
 *   'SOS_CREATED',
 *   event => console.log(event)
 * );
 *
 * unsubscribe();
 */
const subscribeToEvent = (eventType, handler) => {
  if (!isValidEventType(eventType)) {
    throw new Error(
      'A supported eventType is required'
    );
  }

  if (typeof handler !== 'function') {
    throw new Error(
      'Event handler must be a function'
    );
  }

  const eventBus = getEventBus();

  // Isolate synchronous failures so that one faulty consumer
  // does not prevent subsequent consumers from receiving events.
  const safeHandler = (event) => {
    try {
      const result = handler(event);

      // Handle asynchronous consumer failures as well.
      if (
        result &&
        typeof result.then === 'function'
      ) {
        Promise.resolve(result).catch(error => {
          console.error(
            `[EVENT CONSUMER ERROR] ${eventType}:`,
            error
          );
        });
      }
    } catch (error) {
      console.error(
        `[EVENT CONSUMER ERROR] ${eventType}:`,
        error
      );
    }
  };

  eventBus.on(eventType, safeHandler);

  let subscribed = true;

  // Allow callers to remove this exact listener safely.
  return () => {
    if (!subscribed) {
      return false;
    }

    eventBus.off(eventType, safeHandler);
    subscribed = false;

    return true;
  };
};

/**
 * Register one handler for several supported event types.
 *
 * Returns a function that removes all registered listeners.
 */
const subscribeToEvents = (eventTypes, handler) => {
  if (
    !Array.isArray(eventTypes) ||
    eventTypes.length === 0
  ) {
    throw new Error(
      'eventTypes must be a non-empty array'
    );
  }

  if (typeof handler !== 'function') {
    throw new Error(
      'Event handler must be a function'
    );
  }

  // Validate everything before registering any listener.
  for (const eventType of eventTypes) {
    if (!isValidEventType(eventType)) {
      throw new Error(
        `Unsupported event type: ${String(eventType)}`
      );
    }
  }

  const uniqueTypes = [...new Set(eventTypes)];

  const unsubscribeFunctions = uniqueTypes.map(
    eventType => subscribeToEvent(eventType, handler)
  );

  return () => {
    for (const unsubscribe of unsubscribeFunctions) {
      unsubscribe();
    }
  };
};

module.exports = {
  subscribeToEvent,
  subscribeToEvents
};
