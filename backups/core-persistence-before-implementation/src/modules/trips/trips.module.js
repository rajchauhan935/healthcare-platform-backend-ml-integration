const express = require('express');

const controller = require('./trips.controller');

const jwtAuthGuard = require(
  '../auth/guards/jwt-auth.guard'
);

const rolesGuard = require(
  '../auth/guards/roles.guard'
);

const router = express.Router();

router.use(jwtAuthGuard);

// Staff creates a trip from an assigned dispatch.
router.post(
  '/',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.createTrip
);

// Retrieve a trip using its dispatch ID.
// Keep this route before /:id.
router.get(
  '/dispatch/:dispatchId',
  rolesGuard('PATIENT', 'ADMIN', 'DISPATCHER'),
  controller.getTripByDispatchId
);

// Update the trip lifecycle.
router.patch(
  '/:id/status',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.updateTripStatus
);

// Cancel an eligible trip.
router.post(
  '/:id/cancel',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.cancelTrip
);

// Retrieve a trip by trip ID.
router.get(
  '/:id',
  rolesGuard('PATIENT', 'ADMIN', 'DISPATCHER'),
  controller.getTrip
);

module.exports = router;
