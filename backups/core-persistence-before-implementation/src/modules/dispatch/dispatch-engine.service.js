const ambulanceRepository = require(
  '../ambulances/ambulances.repository'
);

const makeError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getAvailableAmbulance = (ambulanceId) => {
  const ambulance = ambulanceRepository.findById(ambulanceId);

  if (!ambulance) {
    throw makeError(404, 'Ambulance not found');
  }

  const available = ambulanceRepository
    .findAvailable()
    .some(item => item.id === ambulance.id);

  if (!available) {
    throw makeError(
      409,
      'Ambulance is not available or does not have an active crew'
    );
  }

  return ambulance;
};

// Selection helper: first eligible ambulance.
// This is a simple local prototype, not distance-based routing.
const selectAvailableAmbulance = ({
  requiredEquipment = []
} = {}) => {
  const candidates = ambulanceRepository
    .findAvailable()
    .filter(ambulance =>
      requiredEquipment.every(item =>
        ambulance.equipment.includes(item)
      )
    );

  return candidates[0] || null;
};

const reserveAmbulance = (ambulanceId) => {
  const ambulance = getAvailableAmbulance(ambulanceId);

  return ambulanceRepository.updateStatus(
    ambulance.id,
    'RESERVED'
  );
};

const validateReplacement = (
  previousAmbulanceId,
  replacementAmbulanceId
) => {
  const previous = ambulanceRepository.findById(
    previousAmbulanceId
  );

  if (!previous || previous.status !== 'RESERVED') {
    throw makeError(
      409,
      'Existing ambulance is not in the expected RESERVED state'
    );
  }

  if (Number(replacementAmbulanceId) === previous.id) {
    throw makeError(
      409,
      'Replacement ambulance must be different'
    );
  }

  const replacement = getAvailableAmbulance(
    replacementAmbulanceId
  );

  return { previous, replacement };
};

const replaceReservedAmbulance = (
  previousAmbulanceId,
  replacementAmbulanceId
) => {
  // Validate both records before changing either status.
  const { previous, replacement } = validateReplacement(
    previousAmbulanceId,
    replacementAmbulanceId
  );

  ambulanceRepository.updateStatus(
    replacement.id,
    'RESERVED'
  );

  ambulanceRepository.updateStatus(
    previous.id,
    'AVAILABLE'
  );

  return {
    previousAmbulanceId: previous.id,
    ambulanceId: replacement.id
  };
};

module.exports = {
  getAvailableAmbulance,
  selectAvailableAmbulance,
  reserveAmbulance,
  validateReplacement,
  replaceReservedAmbulance
};
