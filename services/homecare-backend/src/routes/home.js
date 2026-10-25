const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { responseCache } = require('../middleware/cache');
const { homeSummary } = require('../controllers/homeController');

router.get('/summary', authenticate, requireRole('patient', 'ops', 'admin'),
  responseCache(5000, (req) => {
    const lat = req.query.lat === undefined ? '' : Math.round(Number(req.query.lat) * 100) / 100;
    const lng = req.query.lng === undefined ? '' : Math.round(Number(req.query.lng) * 100) / 100;
    return `home:${lat}:${lng}`;
  }), asyncHandler(homeSummary));
module.exports = router;
