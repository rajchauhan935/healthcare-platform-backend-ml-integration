'use strict';

/**
 * Supported backend domain events.
 *
 * Keep these event names stable because other modules,
 * including Notifications, will depend on them.
 */
const EVENT_TYPES = Object.freeze({
  SOS_CREATED: 'SOS_CREATED',
  AMBULANCE_ASSIGNED: 'AMBULANCE_ASSIGNED',
  LOCATION_UPDATED: 'LOCATION_UPDATED',
  HOSPITAL_PREALERTED: 'HOSPITAL_PREALERTED',
  TRIP_STATUS_CHANGED: 'TRIP_STATUS_CHANGED',
  AMBULANCE_ARRIVED: 'AMBULANCE_ARRIVED'
});

const VALID_EVENT_TYPES = new Set(
  Object.values(EVENT_TYPES)
);

const isValidEventType = (type) => {
  return (
    typeof type === 'string' &&
    VALID_EVENT_TYPES.has(type)
  );
};

module.exports = {
  EVENT_TYPES,
  isValidEventType
};
