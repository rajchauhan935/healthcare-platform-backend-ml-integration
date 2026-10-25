const createCrewAssignmentEntity = ({
  id,
  ambulanceId,
  driverId,
  paramedicId,
  isActive = true
}) => ({
  id,
  ambulanceId,
  driverId,
  paramedicId,
  isActive,
  assignedAt: new Date().toISOString()
});

module.exports = {
  createCrewAssignmentEntity
};