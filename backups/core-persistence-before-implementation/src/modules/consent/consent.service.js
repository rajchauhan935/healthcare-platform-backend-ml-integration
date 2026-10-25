const Consent = require('./entities/consent.entity');

const consents = [];

const getConsentsByPatient = (patientId) => {
  return consents.filter(
    (consent) => consent.patientId === Number(patientId)
  );
};

const createConsent = (data) => {
  const nextId = consents.length
    ? Math.max(...consents.map((consent) => consent.id)) + 1
    : 1;

  const consent = new Consent({
    id: nextId,
    patientId: data.patientId,
    consentType: data.consentType.trim(),
    granted: data.granted,
    createdAt: new Date().toISOString()
  });

  consents.push(consent);

  return consent;
};

module.exports = {
  getConsentsByPatient,
  createConsent
};
