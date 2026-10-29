'use strict';

const express = require('express');

function createHospitalCapacityRoutes(
  controller,
  authenticate,
  verifyHospitalOwnership
) {
  if (
    !controller ||
    typeof controller.getHospitalCapacity !== 'function'
  ) {
    throw new TypeError('A hospital capacity controller is required');
  }

  if (
    typeof controller.updateHospitalCapacity !== 'function'
  ) {
    throw new TypeError(
      'A hospital capacity update controller is required'
    );
  }

  if (typeof authenticate !== 'function') {
    throw new TypeError('Authentication middleware is required');
  }

  if (typeof verifyHospitalOwnership !== 'function') {
    throw new TypeError(
      'Hospital ownership middleware is required'
    );
  }

  const router = express.Router();

  // Provisional endpoints.
  // Intentionally not mounted in server.js.
  router.get(
    '/:hospitalId',
    authenticate,
    verifyHospitalOwnership,
    controller.getHospitalCapacity
  );

  router.patch(
    '/:hospitalId',
    authenticate,
    verifyHospitalOwnership,
    controller.updateHospitalCapacity
  );

  return router;
}

module.exports = {
  createHospitalCapacityRoutes,
};