class AuditLog {
  constructor({ id, userId, action, resource, timestamp }) {
    this.id = id;
    this.userId = userId;
    this.action = action;
    this.resource = resource;
    this.timestamp = timestamp;
  }
}

module.exports = AuditLog;
