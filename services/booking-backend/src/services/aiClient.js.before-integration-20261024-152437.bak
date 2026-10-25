
const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM *
    Math.asin(Math.sqrt(Math.min(1, a)));
}



function validateRecommendation(result, candidates) {
  if (
    !result ||
    typeof result.ambulanceType !== 'string' ||
    typeof result.ambulanceId !== 'string' ||
    typeof result.hospitalCategory !== 'string' ||
    !Array.isArray(result.topHospitals) ||
    !result.topHospitals.every(id => typeof id === 'string') ||
    typeof result.reason !== 'string' ||
    !candidates.some(
      candidate =>
        candidate.id === result.ambulanceId &&
        candidate.type === result.ambulanceType
    )
  ) {
    throw new Error('Invalid recommendation response');
  }

  return result;
}



function validateEta(result) {
  if (
    !result ||
    !Number.isFinite(result.etaMinutes) ||
    result.etaMinutes < 0 ||
    result.etaMinutes > 1440 ||
    !Number.isFinite(result.distanceKm) ||
    result.distanceKm < 0
  ) {
    throw new Error('Invalid ETA response');
  }

  return result;
}


async function requestJson(url, body) {
  if (!url) {
    throw new Error('AI service URL is not configured');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) {
    throw new Error(`AI service returned HTTP ${response.status}`);
  }

  return response.json();
}



async function recommendAmbulance(payload, candidates) {
  if (process.env.AI_MODE !== 'live') {
    const requiredType = {
    cardiac: 'ICU',
    trauma: 'ALS',
    stroke: 'ALS',
    maternity: 'NEONATAL',
    breathing: 'ALS',
    burns: 'ALS',
    general: 'BLS',
  }[payload.emergencyType];

  const eligibleCandidates = requiredType
    ? candidates.filter(candidate => candidate.type === requiredType)
    : candidates;

  const candidate = [...eligibleCandidates].sort(
    (a, b) => a.distanceKm - b.distanceKm
  )[0];

  if (!candidate) {
    throw new Error('No eligible ambulance candidates');
  }

    if (!candidate) {
      throw new Error('No ambulance candidates');
    }

    return {
      ambulanceType: candidate.type,
      ambulanceId: candidate.id,
      hospitalCategory: payload.hospitals?.[0]?.category || 'general',
      topHospitals: payload.hospitals?.length
        ? [payload.hospitals[0].id]
        : [],
      reason: 'Nearest eligible ambulance selected in mock mode',
    };
  }

  const baseUrl = process.env.RECOMMEND_URL?.replace(/\/+$/, '');
  const result = await requestJson(`${baseUrl}/recommend`, payload);

  return validateRecommendation(result, candidates);
}



async function estimateEta(payload, from, to) {
  if (process.env.AI_MODE !== 'live') {
    const distanceKm = haversineDistanceKm(
      from.lat, from.lng, to.lat, to.lng
    );

    return {
      etaMinutes: Math.ceil((distanceKm / 30) * 60),
      distanceKm,
    };
  }

  const baseUrl = process.env.ETA_URL?.replace(/\/+$/, '');
  const result = await requestJson(`${baseUrl}/eta`, payload);

  return validateEta(result);
}


module.exports = {
  haversineDistanceKm,
  validateRecommendation,
  validateEta,
  recommendAmbulance,
  estimateEta,
};
