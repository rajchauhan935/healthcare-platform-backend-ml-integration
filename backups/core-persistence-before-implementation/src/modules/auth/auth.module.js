const express = require('express');

const controller = require('./auth.controller');
const jwtAuthGuard = require('./guards/jwt-auth.guard');

const router = express.Router();

// Auth health-check endpoint
router.get('/', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Auth API is working'
  });
});

// Request a development OTP
router.post('/request-otp', controller.requestOtp);

// Verify OTP and generate JWT tokens
router.post('/verify-otp', controller.verifyOtp);

// Refresh access token
router.post('/refresh-token', controller.refreshToken);

// Get currently authenticated user
router.get('/me', jwtAuthGuard, controller.getMe);

module.exports = router;