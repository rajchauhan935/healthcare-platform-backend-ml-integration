const validateConsent = (data) => {
  const errors = [];

  if (!Number.isInteger(data.patientId) || data.patientId <= 0) {
    errors.push('Valid patientId is required');
  }

  if (
    typeof data.consentType !== 'string' ||
    !data.consentType.trim()
  ) {
    errors.push('Valid consentType is required');
  }

  if (typeof data.granted !== 'boolean') {
    errors.push('granted must be true or false');
  }

  return errors;
};

module.exports = { validateConsent };
