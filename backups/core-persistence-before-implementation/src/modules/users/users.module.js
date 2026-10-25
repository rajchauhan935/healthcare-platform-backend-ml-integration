const express = require('express');
const controller = require('./users.controller');

const jwtAuthGuard = require('../auth/guards/jwt-auth.guard');
const rolesGuard = require('../auth/guards/roles.guard');

const router = express.Router();

// Require authentication for every Users endpoint.
router.use(jwtAuthGuard);

// Temporary demonstration permissions.
router.get('/', rolesGuard('ADMIN'), controller.getAllUsers);

router.get('/:id', rolesGuard('ADMIN'), controller.getUserById);

router.post('/', rolesGuard('ADMIN'), controller.createUser);

router.put('/:id', rolesGuard('ADMIN'), controller.updateUser);

module.exports = router;