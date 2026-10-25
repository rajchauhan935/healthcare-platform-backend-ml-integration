const express = require('express');

const controller = require('./hospitals.controller');

const jwtAuthGuard = require('../auth/guards/jwt-auth.guard');
const rolesGuard = require('../auth/guards/roles.guard');

const router = express.Router();

// All hospital endpoints require a valid JWT.
router.use(jwtAuthGuard);

// Demonstration permissions.
// Confirm final access rules with your supervisor.
router.get('/', rolesGuard('ADMIN', 'DISPATCHER'), controller.getAllHospitals);

router.get(
  '/:id/capacity',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.getHospitalCapacity
);

router.get(
  '/:id',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.getHospitalById
);

router.post(
  '/',
  rolesGuard('ADMIN'),
  controller.createHospital
);

router.patch(
  '/:id/capacity',
  rolesGuard('ADMIN'),
  controller.updateHospitalCapacity
);

module.exports = router;