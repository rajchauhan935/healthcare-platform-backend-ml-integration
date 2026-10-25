const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { me } = require('../controllers/authController');

router.get('/me', authenticate, asyncHandler(me));
module.exports = router;
