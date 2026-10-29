'use strict';

const {
  validateCapacity,
  validateAvailability,
} = require('../validators/hospitalCapacityValidator');

const CAPACITY_FIELDS = Object.freeze([
  'generalBedsTotal',
  'generalBedsFree',
  'icuBedsTotal',
  'icuBedsFree',
]);

function validateCapacityUpdate(currentCapacity, updates) {
  const validation = validateCapacity(
    updates,
    CAPACITY_FIELDS
  );

  if (!validation.valid) {
    return validation;
  }

  if (
    !currentCapacity ||
    typeof currentCapacity !== 'object' ||
    Array.isArray(currentCapacity)
  ) {
    return {
      valid: false,
      errors: ['Existing hospital capacity is required'],
    };
  }

  const nextCapacity = {
    ...currentCapacity,
    ...updates,
  };

  const errors = [];

  const general = validateAvailability(
    nextCapacity.generalBedsTotal,
    nextCapacity.generalBedsFree,
    'General beds'
  );

  if (!general.valid) {
    errors.push(general.message);
  }

  const icu = validateAvailability(
    nextCapacity.icuBedsTotal,
    nextCapacity.icuBedsFree,
    'ICU beds'
  );

  if (!icu.valid) {
    errors.push(icu.message);
  }

  return {
    valid: errors.length === 0,
    errors,
    ...(errors.length === 0 ? { data: nextCapacity } : {}),
  };
}

module.exports = {
  CAPACITY_FIELDS,
  validateCapacityUpdate,
};
