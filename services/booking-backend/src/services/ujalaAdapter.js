const CATEGORY_MAP = {
  general_emergency_hospital: 'general',
  cardiac_capable_emergency_hospital: 'cardiac',
  trauma_capable_emergency_hospital: 'trauma',
  stroke_capable_emergency_hospital: 'neuro',
  maternity_emergency_hospital: 'maternity',
  maternity_and_neonatal_capable_hospital: 'maternity',
  emergency_hospital_with_respiratory_support: 'general',
  burns_capable_emergency_hospital: 'burns',
  hospital_with_critical_care: 'general',
};

const TO_UJALA_CATEGORY = {
  general: 'general_emergency_hospital',
  cardiac: 'cardiac_capable_emergency_hospital',
  trauma: 'trauma_capable_emergency_hospital',
  neuro: 'stroke_capable_emergency_hospital',
  maternity: 'maternity_emergency_hospital',
  burns: 'burns_capable_emergency_hospital',
};

const EMERGENCY_MAP = {
  trauma: 'accident_trauma',
};

function toUjalaRequest(payload) {
  return {
    emergencyType:
      EMERGENCY_MAP[payload.emergencyType] || payload.emergencyType,

    patientLat: payload.patientLat,
    patientLng: payload.patientLng,

    ambulances: (payload.ambulances || []).map(a => ({
      id: a.id,
      category: a.type,
      available: true,
    })),

    hospitals: (payload.hospitals || []).map(h => ({
      id: h.id,
      category: TO_UJALA_CATEGORY[h.category] || h.category,
      freeBeds: h.icuBedsFree,
      pmjay: Boolean(h.pmjayEmpanelled),
      lat: h.lat,
      lng: h.lng,
    })),
  };
}

function fromUjalaResponse(result, candidates) {
  if (!result || typeof result.ambulanceType !== 'string') {
    throw new Error('Invalid Ujala recommendation');
  }

  const eligible = candidates
    .filter(a => a.type === result.ambulanceType)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (!eligible.length) {
    throw new Error(
      'Ujala ambulance type does not match available Kartik candidates'
    );
  }

  return {
    ambulanceType: eligible[0].type,
    ambulanceId: eligible[0].id,
    hospitalCategory:
      CATEGORY_MAP[result.hospitalCategory] ||
      result.hospitalCategory,

    topHospitals: Array.isArray(result.topHospitals)
      ? result.topHospitals
          .map(h => typeof h === 'string' ? h : h?.id)
          .filter(id => typeof id === 'string')
      : [],

    reason: result.reason,
  };
}

module.exports = {
  toUjalaRequest,
  fromUjalaResponse,
};
