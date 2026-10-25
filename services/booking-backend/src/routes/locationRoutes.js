const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth');

const {
  updateAmbulanceLocation,
  getAmbulanceLocationHistory,
} = require('../controllers/locationController');


// Only operations staff and admins can update ambulance GPS locations.
router.post(
  '/:id/location',
  authenticate,
  authorize('ops', 'admin'),
  updateAmbulanceLocation
);

router.get(
  '/:id/location/history',
  authenticate,
  authorize('ops', 'admin'),
  getAmbulanceLocationHistory
);

module.exports = router;