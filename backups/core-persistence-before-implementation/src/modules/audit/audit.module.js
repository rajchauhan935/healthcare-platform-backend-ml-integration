const express = require('express');
const controller = require('./audit.controller');

const jwtAuthGuard = require('../auth/guards/jwt-auth.guard');
const rolesGuard = require('../auth/guards/roles.guard');

const router = express.Router();

// All Audit endpoints require authentication.
router.use(jwtAuthGuard);

// Demonstration audit viewing permissions.
router.get('/', rolesGuard('ADMIN'), controller.getAllLogs);

router.get(
  '/user/:userId',
  rolesGuard('ADMIN'),
  controller.getLogsByUserId
);

// Do not expose public audit-log creation.
// Logs should eventually be created automatically by trusted server code.

module.exports = router;