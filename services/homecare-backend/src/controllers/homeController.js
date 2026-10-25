const Joi = require('joi');
const { ok } = require('../utils/response');
const { getHomeSummary } = require('../services/homeService');
const { getDashboardSummary } = require('../services/dashboardService');

async function homeSummary(req, res) {
  const schema = Joi.object({
    lat: Joi.number().min(-90).max(90),
    lng: Joi.number().min(-180).max(180)
  }).unknown(false);
  const { error, value } = schema.validate(req.query);
  if (error || ((value.lat === undefined) !== (value.lng === undefined))) {
    const AppError = require('../utils/AppError');
    throw new AppError(400, 'VALIDATION_ERROR', 'lat and lng must be supplied together with valid coordinates');
  }
  return ok(res, await getHomeSummary(value.lat, value.lng));
}

async function dashboardSummary(_req, res) {
  return ok(res, await getDashboardSummary());
}

module.exports = { homeSummary, dashboardSummary };
