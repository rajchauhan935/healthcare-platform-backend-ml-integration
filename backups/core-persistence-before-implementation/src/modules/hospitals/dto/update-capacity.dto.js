const validateUpdateCapacity = (body = {}) => {
  const errors = [];

  const fields = [
    'availableBeds',
    'availableIcuBeds',
    'availableVentilators'
  ];

  for (const field of fields) {
    if (
      !Number.isInteger(body[field]) ||
      body[field] < 0
    ) {
      errors.push(`${field} must be a non-negative integer`);
    }
  }

  return errors;
};

module.exports = {
  validateUpdateCapacity
};