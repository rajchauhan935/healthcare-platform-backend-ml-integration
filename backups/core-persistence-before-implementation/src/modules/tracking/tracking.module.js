const express = require('express');

const controller = require('./tracking.controller');

const jwtAuthGuard = require(
  '../auth/guards/jwt-auth.guard'
);

const rolesGuard = require(
  '../auth/guards/roles.guard'
);

const router = express.Router();

// Every Tracking endpoint requires a valid access token.
router.use(jwtAuthGuard);

// Prototype GPS updates:
// Only ADMIN and DISPATCHER can submit simulated locations.
router.post(
  '/:id/location',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.updateLocation
);

// Patients may view their own trip tracking.
// The service verifies trip ownership.
router.get(
  '/:id/tracking',
  rolesGuard('PATIENT', 'ADMIN', 'DISPATCHER'),
  controller.getLatestLocation
);

module.exports = router;
