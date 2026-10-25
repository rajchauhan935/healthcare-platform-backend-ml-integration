'use strict';

const {
  EVENT_TYPES,
  subscribeToEvents
} = require('../events/events.module');

const notificationsService = require(
  './notifications.service'
);

const smsProvider = require('./sms.provider');

const NOTIFICATION_EVENTS = Object.freeze([
  EVENT_TYPES.SOS_CREATED,
  EVENT_TYPES.AMBULANCE_ASSIGNED,
  EVENT_TYPES.LOCATION_UPDATED,
  EVENT_TYPES.HOSPITAL_PREALERTED,
  EVENT_TYPES.TRIP_STATUS_CHANGED,
  EVENT_TYPES.AMBULANCE_ARRIVED
]);

let stopSubscription = null;

/**
 * Register Notifications as an Events consumer.
 *
 * resolveRecipient must be provided by a trusted integration.
 *
 * Signature:
 * resolveRecipient(event) => recipient string or null
 *
 * A null result means the event is skipped.
 */
const initializeNotifications = ({ resolveRecipient } = {}) => {
  if (stopSubscription) {
    return false;
  }

  if (typeof resolveRecipient !== 'function') {
    throw new Error(
      'A trusted resolveRecipient function is required'
    );
  }

  stopSubscription = subscribeToEvents(
    NOTIFICATION_EVENTS,
    async event => {
      const recipient = await resolveRecipient(event);

      if (recipient == null) {
        return;
      }

      if (
        typeof recipient !== 'string' ||
        !recipient.trim()
      ) {
        throw new Error(
          'Recipient resolver returned an invalid value'
        );
      }

      const result = await notificationsService.notifyFromEvent(
        event,
        recipient
      );

      if (result.status === 'FAILED') {
        console.error(
          '[NOTIFICATION FAILURE]',
          JSON.stringify({
            notificationId: result.id,
            eventId: event.eventId,
            eventType: event.eventType,
            failureCode: result.failureCode
          })
        );
      }
    }
  );

  return true;
};

/**
 * Unregister consumers, useful for controlled shutdown
 * and isolated testing.
 */
const shutdownNotifications = () => {
  if (!stopSubscription) {
    return false;
  }

  stopSubscription();
  stopSubscription = null;

  return true;
};

module.exports = {
  NOTIFICATION_EVENTS,
  initializeNotifications,
  shutdownNotifications,
  ...notificationsService,
  smsProvider
};
