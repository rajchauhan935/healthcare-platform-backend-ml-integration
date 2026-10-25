const DISPATCH_STATUSES = Object.freeze({
  REQUESTED: 'REQUESTED',
  SEARCHING: 'SEARCHING',
  ASSIGNED: 'ASSIGNED',
  CANCELLED: 'CANCELLED'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  REQUESTED: ['SEARCHING', 'ASSIGNED', 'CANCELLED'],
  SEARCHING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['CANCELLED'],
  CANCELLED: []
});

const canTransition = (fromStatus, toStatus) => {
  return (ALLOWED_TRANSITIONS[fromStatus] || [])
    .includes(toStatus);
};

const assertTransition = (fromStatus, toStatus) => {
  if (!canTransition(fromStatus, toStatus)) {
    const error = new Error(
      `Invalid dispatch transition: ${fromStatus} -> ${toStatus}`
    );
    error.statusCode = 409;
    throw error;
  }

  return true;
};

const assertCanAssign = (dispatch) => {
  if (!dispatch || dispatch.status !== DISPATCH_STATUSES.REQUESTED) {
    const error = new Error(
      'Only a REQUESTED dispatch can receive its first assignment'
    );
    error.statusCode = 409;
    throw error;
  }

  return true;
};

const assertCanReassign = (dispatch) => {
  if (
    !dispatch ||
    dispatch.status !== DISPATCH_STATUSES.ASSIGNED ||
    dispatch.ambulanceId == null
  ) {
    const error = new Error(
      'Only an ASSIGNED dispatch can be reassigned'
    );
    error.statusCode = 409;
    throw error;
  }

  return true;
};

module.exports = {
  DISPATCH_STATUSES,
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition,
  assertCanAssign,
  assertCanReassign
};
