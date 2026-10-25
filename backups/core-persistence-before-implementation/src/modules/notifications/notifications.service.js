'use strict';

const { randomUUID } = require('node:crypto');

const { sendSms } = require('./sms.provider');

const {
  EVENT_TYPES
} = require('../events/event-types');

// Bounded in-memory prototype storage.
const notifications = new Map();
const processedEvents = new Map();

const MAX_RECORDS = 500;

/**
 * Keep storage bounded.
 * Production must replace this with durable persistence.
 */
const saveBounded = (map, key, value) => {
  if (!map.has(key) && map.size >= MAX_RECORDS) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }

  map.set(key, value);
};

/**
 * Build safe, generic messages.
 *
 * Do not put patient diagnoses, GPS coordinates,
 * or other sensitive medical information in SMS text.
 */
const buildMessage = event => {
  const payload = event.payload || {};

  switch (event.eventType) {
    case EVENT_TYPES.SOS_CREATED:
      return 'Your emergency request has been received.';

    case EVENT_TYPES.AMBULANCE_ASSIGNED:
      return 'An ambulance has been assigned to your request.';

    case EVENT_TYPES.LOCATION_UPDATED:
      return 'Your ambulance tracking information has been updated.';

    case EVENT_TYPES.HOSPITAL_PREALERTED:
      return 'The receiving hospital has been notified.';

    case EVENT_TYPES.TRIP_STATUS_CHANGED:
      return typeof payload.status === 'string'
        ? `Your ambulance trip status is now ${payload.status}.`
        : 'Your ambulance trip status has changed.';

    case EVENT_TYPES.AMBULANCE_ARRIVED:
      return 'Your assigned ambulance has arrived.';

    default:
      throw new Error('Unsupported notification event');
  }
};

/**
 * Create and simulate delivery of one notification.
 *
 * recipient must be supplied by a trusted backend module.
 * Never accept an arbitrary recipient directly from
 * an unauthenticated HTTP request.
 */
const sendNotification = async ({
  recipient,
  message,
  eventId = null,
  eventType = null
}) => {
  if (
    typeof recipient !== 'string' ||
    !recipient.trim() ||
    recipient.length > 100
  ) {
    throw new Error('A valid recipient is required');
  }

  if (
    typeof message !== 'string' ||
    !message.trim() ||
    message.length > 500
  ) {
    throw new Error('A valid notification message is required');
  }

  if (
    eventId !== null &&
    (typeof eventId !== 'string' || !eventId.trim())
  ) {
    throw new Error('eventId must be a non-empty string');
  }

  const normalizedRecipient = recipient.trim();
  const normalizedEventId = eventId ? eventId.trim() : null;

  // Idempotency is scoped to the event and recipient.
  const idempotencyKey = normalizedEventId
    ? JSON.stringify([normalizedEventId, normalizedRecipient])
    : null;

  if (idempotencyKey && processedEvents.has(idempotencyKey)) {
    const existingId = processedEvents.get(idempotencyKey);
    const existing = notifications.get(existingId);

    if (existing) {
      return {
        ...existing,
        duplicate: true
      };
    }

    processedEvents.delete(idempotencyKey);
  }

  const notification = {
    id: randomUUID(),
    eventId: normalizedEventId,
    eventType,
    channel: 'SMS',
    provider: 'DEMO_SMS',
    simulated: true,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    completedAt: null,
    providerMessageId: null,
    failureCode: null
  };

  saveBounded(notifications, notification.id, notification);

  // Reserve the event/recipient pair before awaiting delivery.
  if (idempotencyKey) {
    saveBounded(
      processedEvents,
      idempotencyKey,
      notification.id
    );
  }

  try {
    const result = await sendSms({
      recipient: normalizedRecipient,
      message: message.trim()
    });

    notification.status = 'SIMULATED';
    notification.providerMessageId = result.messageId;
    notification.completedAt = new Date().toISOString();

    return {
      ...notification,
      duplicate: false
    };
  } catch (error) {
    notification.status = 'FAILED';
    notification.failureCode =
      error.code || 'PROVIDER_ERROR';
    notification.completedAt = new Date().toISOString();

    // Allow a later retry of a failed delivery.
    if (idempotencyKey) {
      processedEvents.delete(idempotencyKey);
    }

    return {
      ...notification,
      duplicate: false
    };
  }
};

/**
 * Process a domain event.
 *
 * The recipient is resolved by the caller, not taken
 * from an arbitrary event payload.
 */
const notifyFromEvent = async (event, recipient) => {
  if (
    !event ||
    typeof event.eventId !== 'string' ||
    !event.eventId.trim() ||
    typeof event.eventType !== 'string'
  ) {
    throw new Error('A valid event envelope is required');
  }

  return sendNotification({
    recipient,
    message: buildMessage(event),
    eventId: event.eventId,
    eventType: event.eventType
  });
};

/**
 * Return a safe notification status record.
 */
const getNotificationById = id => {
  const notification = notifications.get(id);

  return notification ? { ...notification } : null;
};

module.exports = {
  buildMessage,
  sendNotification,
  notifyFromEvent,
  getNotificationById
};
