const express = require('express');

const controller = require('./dispatch.controller');

const jwtAuthGuard = require(
  '../auth/guards/jwt-auth.guard'
);

const rolesGuard = require(
  '../auth/guards/roles.guard'
);

const router = express.Router();

// All Dispatch endpoints require a valid JWT.
router.use(jwtAuthGuard);

// PATIENT creates an SOS request.
router.post(
  '/sos',
  rolesGuard('PATIENT'),
  controller.createSos
);

// ADMIN or DISPATCHER assigns an ambulance.
router.post(
  '/:id/assign',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.assignAmbulance
);

// ADMIN or DISPATCHER replaces an assigned ambulance.
router.post(
  '/:id/reassign',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.reassignAmbulance
);

// PATIENT can view their own dispatch.
// ADMIN and DISPATCHER can view any dispatch.
router.get(
  '/:id',
  rolesGuard('PATIENT', 'ADMIN', 'DISPATCHER'),
  controller.getDispatch
);

module.exports = router;
