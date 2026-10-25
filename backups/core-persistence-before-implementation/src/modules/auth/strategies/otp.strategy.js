const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Temporary OTP storage for local development
const otpStore = new Map();

// OTP will expire after 5 minutes
const OTP_EXPIRY_MS = 5 * 60 * 1000;

// Generate a secure random 6-digit OTP
const generateOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

// Create an OTP for an email address
const createOtp = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();

  const otp = generateOtp();

  // Store a hash, not the original OTP
  const otpHash = await bcrypt.hash(otp, 10);

  otpStore.set(normalizedEmail, {
    otpHash,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0
  });

  // Return the OTP only for local development/testing.
  return otp;
};

// Verify an OTP submitted by the user
const verifyOtp = async (email, submittedOtp) => {
  const normalizedEmail = email.trim().toLowerCase();

  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return {
      success: false,
      message: 'OTP not found. Please request a new OTP.'
    };
  }

  // Check expiration
  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedEmail);

    return {
      success: false,
      message: 'OTP has expired.'
    };
  }

  // Allow a maximum of 5 verification attempts
  if (record.attempts >= 5) {
    otpStore.delete(normalizedEmail);

    return {
      success: false,
      message: 'Too many attempts. Please request a new OTP.'
    };
  }

  record.attempts += 1;

  // Compare submitted OTP with its stored hash
  const isValid = await bcrypt.compare(
    submittedOtp,
    record.otpHash
  );

  if (!isValid) {
    if (record.attempts >= 5) {
      otpStore.delete(normalizedEmail);

      return {
        success: false,
        message: 'Too many attempts. Please request a new OTP.'
      };
    }

    return {
      success: false,
      message: 'Invalid OTP.'
    };
  }

  // Delete the OTP after successful verification
  otpStore.delete(normalizedEmail);

  return {
    success: true,
    message: 'OTP verified successfully.'
  };
};

module.exports = {
  generateOtp,
  createOtp,
  verifyOtp
};
