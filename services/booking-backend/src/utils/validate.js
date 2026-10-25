
function validateEnum(value, allowedValues, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (!allowedValues.includes(value)) {
    return {
      field: fieldName,
      message: `Invalid ${fieldName}`,
      allowedValues,
    };
  }

  return null;
}

function validateNumber(value, fieldName, min, max) {
  const number = Number(value);

  if (
    value === undefined ||
    value === null ||
    value === '' ||
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    return {
      field: fieldName,
      message: `${fieldName} must be between ${min} and ${max}`,
    };
  }

  return null;
}

module.exports = { validateEnum, validateNumber };
