const express = require('express');
const controller = require('./patients.controller');

const jwtAuthGuard = require('../auth/guards/jwt-auth.guard');
const rolesGuard = require('../auth/guards/roles.guard');

const router = express.Router();

// All Patients endpoints require a valid access token.
router.use(jwtAuthGuard);

// Demonstration role restrictions.
router.get(
  '/',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.getAllPatients
);

router.get(
  '/:id',
  rolesGuard('ADMIN', 'DISPATCHER'),
  controller.getPatientById
);

router.post(
  '/',
  rolesGuard('ADMIN'),
  controller.createPatient
);

router.put(
  '/:id',
  rolesGuard('ADMIN'),
  controller.updatePatient
);

router.delete(
  '/:id',
  rolesGuard('ADMIN'),
  controller.deletePatient
);

module.exports = router;