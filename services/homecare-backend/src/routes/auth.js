const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { login } = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimit');

router.post('/login', loginLimiter, asyncHandler(login));
module.exports = router;
