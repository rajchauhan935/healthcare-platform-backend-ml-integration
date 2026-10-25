const express = require('express');

const controller = require('./consent.controller');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Consent API is working'
  });
});

router.get('/patient/:patientId', controller.getPatientConsents);

router.post('/', controller.createConsent);

module.exports = router;
