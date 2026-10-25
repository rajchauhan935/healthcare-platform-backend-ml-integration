const express = require('express');

const controller = require('./ambulances.controller');

const jwtAuthGuard = require('../auth/guards/jwt-auth.guard');
const rolesGuard = require('../auth/guards/roles.guard');

const router = express.Router();

// All ambulance endpoints require authentication.
router.use(jwtAuthGuard);

// IMPORTANT: /available must be registered before /:id.
router.get(
  '/available',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.getAvailableAmbulances
);

router.get(
  '/',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.getAllAmbulances
);

router.get(
  '/:id',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.getAmbulanceById
);

router.patch(
  '/:id/status',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.updateAmbulanceStatus
);

module.exports = router;