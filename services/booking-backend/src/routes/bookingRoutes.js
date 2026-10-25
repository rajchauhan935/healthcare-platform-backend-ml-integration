
const express = require('express');
const {
  createBooking,
  getBooking,
  listBookings,
  updateBookingStatus,
} = require('../controllers/bookingController');

const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', createBooking);
router.get('/', listBookings);
router.get('/:id', getBooking);

router.patch('/:id/status', updateBookingStatus);

module.exports = router;
