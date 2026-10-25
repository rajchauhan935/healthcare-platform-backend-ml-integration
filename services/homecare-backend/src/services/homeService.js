const path = require('path');
const content = require('../config/homeContent');
const db = require('../config/db');

async function getNearbyAmbulanceCount(lat, lng) {
  // If coordinates are provided, Naga's BE-08 location query can replace this service body.
  // Until the shared ambulance schema is merged, return a safe sample count.
  if (lat !== undefined && lng !== undefined && !Number.isFinite(Number(lat) + Number(lng))) return 0;
  try {
    const result = await db.query("SELECT COUNT(*)::int AS count FROM ambulances WHERE status = 'available'");
    return result.rows[0].count;
  } catch (_error) {
    return 3;
  }
}

async function getHomeSummary(lat, lng) {
  const nearbyAmbulanceCount = await getNearbyAmbulanceCount(lat, lng);
  return {
    nearbyAmbulanceCount,
    nearbyRadiusKm: 10,
    quickServices: content.quickServices,
    emergencyContacts: content.emergencyContacts
  };
}

function getDashboardFilePath() {
  return path.join(__dirname, '../../mock-data/dashboard_summary.json');
}

module.exports = { getHomeSummary, getNearbyAmbulanceCount, getDashboardFilePath };
