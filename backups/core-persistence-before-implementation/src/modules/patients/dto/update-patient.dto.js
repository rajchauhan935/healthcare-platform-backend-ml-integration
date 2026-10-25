const {
  validateCreatePatient
} = require('./create-patient.dto');

const validateUpdatePatient = (data, existingUserId) => {
  const errors = validateCreatePatient({
    ...data,
    userId: existingUserId
  });

  if (data && data.userId !== undefined) {
    errors.push('userId cannot be changed through this endpoint');
  }

  return errors;
};

module.exports = { validateUpdatePatient };