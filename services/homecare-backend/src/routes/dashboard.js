const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { responseCache } = require('../middleware/cache');
const { dashboardSummary } = require('../controllers/homeController');

router.get('/summary', authenticate, requireRole('ops', 'admin'),
  responseCache(10000, () => 'dashboard:summary'), asyncHandler(dashboardSummary));
module.exports = router;
