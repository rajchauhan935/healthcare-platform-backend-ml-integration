const repository = require('./audit.repository');

const getAllLogs = () => {
  return repository.findAll();
};

const getLogsByUserId = (userId) => {
  return repository.findByUserId(userId);
};

const createLog = (data) => {
  return repository.create({
    userId: data.userId,
    action: data.action.trim(),
    resource: data.resource.trim()
  });
};

module.exports = {
  getAllLogs,
  getLogsByUserId,
  createLog
};
