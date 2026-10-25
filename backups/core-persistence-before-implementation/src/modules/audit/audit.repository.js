const AuditLog = require('./entities/audit-log.entity');

const auditLogs = [];

const findAll = () => {
  return auditLogs;
};

const findByUserId = (userId) => {
  return auditLogs.filter(
    (log) => log.userId === Number(userId)
  );
};

const create = (data) => {
  const nextId = auditLogs.length
    ? Math.max(...auditLogs.map((log) => log.id)) + 1
    : 1;

  const log = new AuditLog({
    id: nextId,
    userId: data.userId,
    action: data.action,
    resource: data.resource,
    timestamp: new Date().toISOString()
  });

  auditLogs.push(log);

  return log;
};

module.exports = {
  findAll,
  findByUserId,
  create
};
