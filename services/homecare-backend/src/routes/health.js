const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { health } = require('../controllers/healthController');

router.get('/', asyncHandler(health));
module.exports = router;
