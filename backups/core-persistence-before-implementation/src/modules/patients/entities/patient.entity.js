class Patient {
  constructor({ id, userId, profile, emergencyContact, createdAt }) {
    this.id = id;
    this.userId = userId;
    this.profile = profile;
    this.emergencyContact = emergencyContact;
    this.createdAt = createdAt;
  }
}

module.exports = Patient;