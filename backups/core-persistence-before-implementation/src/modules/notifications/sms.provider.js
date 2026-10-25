'use strict';

/**
 * Demo SMS provider.
 *
 * This is intentionally a simulation:
 * - No real SMS is sent.
 * - No external API is contacted.
 * - No credentials are required.
 *
 * A production provider can later replace this implementation
 * without changing notifications.service.js.
 */

const { randomUUID } = require('node:crypto');

const sendSms = async ({ recipient, message }) => {
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
    throw new Error(
      'SMS message must contain 1 to 500 characters'
    );
  }

  // Deliberate fictional failure for testing recovery.
  if (recipient === 'DEMO-FAIL') {
    const error = new Error('Simulated SMS provider failure');
    error.code = 'DEMO_PROVIDER_FAILURE';
    throw error;
  }

  return {
    success: true,
    provider: 'DEMO_SMS',
    simulated: true,
    messageId: randomUUID(),
    status: 'SIMULATED',
    sentAt: new Date().toISOString()
  };
};

module.exports = {
  sendSms
};
