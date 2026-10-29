'use strict';

function validateCapacity(payload, allowedFields) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return {
      valid: false,
      errors: ['Request body must be an object'],
    };
  }

  const errors = [];
  const keys = Object.keys(payload);

  if (keys.length === 0) {
    errors.push('At least one capacity field is required');
  }

  for (const key of keys) {
    if (!allowedFields.includes(key)) {
      errors.push(`Unknown capacity field: ${key}`);
      continue;
    }

    const value = payload[key];

    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      errors.push(
        `${key} must be a non-negative safe integer`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateAvailability(total, available, label) {
  if (
    !Number.isSafeInteger(total) ||
    !Number.isSafeInteger(available) ||
    total < 0 ||
    available < 0
  ) {
    return {
      valid: false,
      message: `${label} counts must be non-negative integers`,
    };
  }

  if (available > total) {
    return {
      valid: false,
      message: `${label} available capacity cannot exceed total capacity`,
    };
  }

  return { valid: true };
}

module.exports = {
  validateCapacity,
  validateAvailability,
};
