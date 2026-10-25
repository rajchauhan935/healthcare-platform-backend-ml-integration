const fs = require('fs');
const path = require('path');
const Joi = require('joi');
const db = require('../config/db');

const dashboardSchema = Joi.object({
  emergencyCountToday: Joi.number().integer().min(0).required(),
  activeAmbulances: Joi.number().integer().min(0).required(),
  hospitalsAvailable: Joi.number().integer().min(0).required(),
  avgResponseMinutes: Joi.number().min(0).required(),
  priorityAlerts: Joi.array().items(Joi.object({
    level: Joi.string().valid('high', 'medium', 'low').required(),
    text: Joi.string().required()
  }).unknown(false)).required(),
  emergenciesByHour: Joi.array().length(24).items(Joi.object({
    hour: Joi.number().integer().min(0).max(23).required(),
    count: Joi.number().integer().min(0).required()
  }).unknown(false)).required(),
  generatedAt: Joi.string().isoDate().required()
}).unknown(false);

const dashboardFile = path.join(__dirname, '../../mock-data/dashboard_summary.json');

function readFileSummary() {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(dashboardFile, 'utf8'));
  } catch (_error) {
    const error = new Error('Dashboard sample data is missing or invalid');
    error.statusCode = 503;
    error.code = 'UPSTREAM_UNAVAILABLE';
    throw error;
  }
  const { error, value: valid } = dashboardSchema.validate(value, { abortEarly: false });
  if (error) {
    const invalid = new Error('Dashboard sample data is missing or invalid');
    invalid.statusCode = 503;
    invalid.code = 'UPSTREAM_UNAVAILABLE';
    throw invalid;
  }
  return valid;
}

async function readDbSummary() {
  // Table/column contract must be confirmed with the database owner before enabling DASHBOARD_SOURCE=db.
  const [bookings, ambulances, hospitals, response] = await Promise.all([
    db.query("SELECT COUNT(*)::int AS count FROM bookings WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AND status <> 'cancelled'"),
    db.query("SELECT COUNT(*)::int AS count FROM ambulances WHERE status IN ('available', 'busy')"),
    db.query('SELECT COUNT(*)::int AS count FROM hospitals WHERE icu_beds_free > 0'),
    db.query("SELECT AVG(eta_minutes)::numeric AS avg FROM bookings WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AND status <> 'cancelled'")
  ]);
  const byHour = await db.query("SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour, COUNT(*)::int AS count FROM bookings WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AND status <> 'cancelled' GROUP BY hour");
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  byHour.rows.forEach((row) => { counts[row.hour].count = row.count; });
  const avg = response.rows[0].avg === null ? readFileSummary().avgResponseMinutes : Number(response.rows[0].avg);
  const result = {
    emergencyCountToday: bookings.rows[0].count,
    activeAmbulances: ambulances.rows[0].count,
    hospitalsAvailable: hospitals.rows[0].count,
    avgResponseMinutes: Number(avg.toFixed(1)),
    priorityAlerts: [],
    emergenciesByHour: counts,
    generatedAt: new Date().toISOString()
  };
  const { error, value } = dashboardSchema.validate(result);
  if (error) throw error;
  return value;
}

async function getDashboardSummary() {
  if (process.env.DASHBOARD_SOURCE === 'db') {
    try {
      return await readDbSummary();
    } catch (error) {
      console.warn('Dashboard DB provider failed; using file provider:', error.message);
      return readFileSummary();
    }
  }
  return readFileSummary();
}

module.exports = { getDashboardSummary, dashboardSchema, readFileSummary, readDbSummary };
