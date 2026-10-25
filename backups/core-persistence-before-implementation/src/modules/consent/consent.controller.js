const consentService = require('./consent.service');
const { validateConsent } = require('./dto/consent.dto');

const getPatientConsents = (req, res) => {
  const patientId = Number(req.params.patientId);

  if (!Number.isInteger(patientId) || patientId <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid patient ID'
    });
  }

  return res.status(200).json({
    success: true,
    data: consentService.getConsentsByPatient(patientId)
  });
};

const createConsent = (req, res) => {
  const errors = validateConsent(req.body);

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const consent = consentService.createConsent(req.body);

  return res.status(201).json({
    success: true,
    message: 'Consent record created successfully',
    data: consent
  });
};

module.exports = {
  getPatientConsents,
  createConsent
};
