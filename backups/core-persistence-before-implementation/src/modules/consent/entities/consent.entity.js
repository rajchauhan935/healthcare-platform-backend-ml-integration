class Consent {
  constructor({ id, patientId, consentType, granted, createdAt }) {
    this.id = id;
    this.patientId = patientId;
    this.consentType = consentType;
    this.granted = granted;
    this.createdAt = createdAt;
  }
}

module.exports = Consent;
