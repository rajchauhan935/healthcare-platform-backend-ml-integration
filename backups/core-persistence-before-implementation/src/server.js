'use strict';

require('dotenv').config();

const app = require('./app');

const {
  initializeTrackingGateway
} = require('./modules/tracking/tracking.gateway');

const {
  initializeNotifications,
  shutdownNotifications
} = require('./modules/notifications/notifications.module');

const PORT = Number(process.env.PORT) || 3000;

console.log('Starting backend...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', PORT);

/**
 * Demo-only notification integration.
 *
 * No real patient contact details are available in the
 * inspected Users repository.
 *
 * Do not use an arbitrary phone number, email address,
 * emergency contact, or untrusted event payload as a
 * notification destination.
 *
 * The current SMS provider simulates delivery only.
 */
const initializeDemoNotifications = () => {
  if (process.env.DEMO_NOTIFICATIONS_ENABLED !== 'true') {
    console.log(
      'Demo notifications disabled (set DEMO_NOTIFICATIONS_ENABLED=true to enable)'
    );

    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Demo notification recipient must not be enabled in production'
    );
  }

  const initialized = initializeNotifications({
    resolveRecipient: event => {
      // Only events associated with an existing patient user
      // are eligible for the fictional demo destination.
      const patientId = event?.payload?.patientId;

      if (patientId == null) {
        return null;
      }

      const usersRepository = require(
        './modules/users/users.repository'
      );

      const user = usersRepository.findById(patientId);

      if (!user || user.role !== 'PATIENT') {
        return null;
      }

      // Fictional provider identifier, not a phone number.
      return 'DEMO-PATIENT-NOTIFICATIONS';
    }
  });

  if (initialized) {
    console.log(
      'Demo notifications initialized (simulated SMS only)'
    );
  }

  return initialized;
};

// Register consumers before accepting HTTP requests.
// This prevents early application events from being missed
// simply because Notifications was initialized too late.
initializeDemoNotifications();

// Start the existing Express HTTP server.
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(
    `Backend server running at http://127.0.0.1:${PORT}`
  );

  console.log('Server listening:', server.listening);
});

// Attach Socket.IO to the SAME HTTP server.
initializeTrackingGateway(server);

console.log('Tracking gateway initialized');

// Preserve server error reporting.
server.on('error', error => {
  console.error('SERVER ERROR:', error);

  shutdownNotifications();

  process.exitCode = 1;
});

server.on('close', () => {
  shutdownNotifications();

  console.error(
    'SERVER CLOSED: The HTTP listener has stopped.'
  );
});

process.on('beforeExit', code => {
  console.error('PROCESS BEFORE EXIT:', code);
});

process.on('exit', code => {
  console.error('PROCESS EXIT:', code);
});
