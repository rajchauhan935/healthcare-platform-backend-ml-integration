'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('node:fs/promises');
const path = require('node:path');

// Existing core modules
const patientRoutes = require('./modules/patients/patients.module');
const userRoutes = require('./modules/users/users.module');
const consentRoutes = require('./modules/consent/consent.module');
const auditRoutes = require('./modules/audit/audit.module');
const authRoutes = require('./modules/auth/auth.module');

// Backend Intern 2 modules
const hospitalRoutes = require('./modules/hospitals/hospitals.module');
const ambulanceRoutes = require('./modules/ambulances/ambulances.module');
const dispatchRoutes = require('./modules/dispatch/dispatch.module');
const tripsRoutes = require('./modules/trips/trips.module');
const trackingRoutes = require('./modules/tracking/tracking.module');

// Reuse the existing authentication guards.
// No new analytics backend module is required.
const jwtAuthGuard = require('./modules/auth/guards/jwt-auth.guard');
const rolesGuard = require('./modules/auth/guards/roles.guard');

const app = express();

// Global middleware
app.use(cors());
app.use(express.json());

// Root health response
app.get('/', (req, res) => {
  return res.json({
    success: true,
    message: 'Emergency Healthcare Backend is running'
  });
});

// Existing core routes
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/consents', consentRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/auth', authRoutes);

// Backend Intern 2 routes
app.use('/api/v1/hospitals', hospitalRoutes);
app.use('/api/v1/ambulances', ambulanceRoutes);
app.use('/api/v1/dispatch', dispatchRoutes);

// Trips and Tracking intentionally share the same URL prefix.
// They expose different endpoint paths.
app.use('/api/v1/trips', tripsRoutes);
app.use('/api/v1/trips', trackingRoutes);

// ---------------------------------------------------------
// Python ML -> Node.js integration
// Implemented in this EXISTING file only.
// ---------------------------------------------------------

const analyticsRouter = express.Router();

// Project layout:
// healthcare-platform/apps/backend/src/app.js
// healthcare-platform/ml/analytics/predictions.json
const predictionsPath = path.resolve(
  __dirname,
  '../../../ml/analytics/predictions.json'
);

analyticsRouter.use(jwtAuthGuard);
analyticsRouter.use(rolesGuard('ADMIN', 'DISPATCHER'));

const isFiniteNonNegative = (value) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0;

const isValidEvaluation = (value) =>
  value &&
  typeof value === 'object' &&
  isFiniteNonNegative(value.modelMAE) &&
  isFiniteNonNegative(value.baselineMAE) &&
  typeof value.beatsBaseline === 'boolean';

const isValidPredictions = (data) => {
  if (
    !data ||
    typeof data !== 'object' ||
    data.success !== true ||
    data.simulated !== true ||
    data.trainingData !== 'FICTIONAL' ||
    data.source !== 'EXPERIMENTAL_PYTHON_ML' ||
    typeof data.modelVersion !== 'string' ||
    !data.modelVersion.trim() ||
    typeof data.warning !== 'string' ||
    !data.predictions ||
    !data.models
  ) {
    return false;
  }

  const {
    demand,
    responseTime,
    hospitalCapacity
  } = data.predictions;

  if (
    !isValidEvaluation(data.models.demand) ||
    !isValidEvaluation(data.models.response_time) ||
    !isValidEvaluation(data.models.hospital_capacity)
  ) {
    return false;
  }

  if (
    !demand ||
    !Array.isArray(demand.predictions) ||
    demand.predictions.length !== 24 ||
    !demand.predictions.every((item) =>
      typeof item.timestamp === 'string' &&
      !Number.isNaN(Date.parse(item.timestamp)) &&
      isFiniteNonNegative(item.estimatedEmergencyCount)
    )
  ) {
    return false;
  }

  if (
    !responseTime ||
    !responseTime.scenario ||
    !isFiniteNonNegative(
      responseTime.estimatedResponseMinutes
    )
  ) {
    return false;
  }

  if (
    !hospitalCapacity ||
    !Array.isArray(hospitalCapacity.predictions) ||
    hospitalCapacity.predictions.length === 0 ||
    !hospitalCapacity.predictions.every((item) =>
      typeof item.hospitalId === 'string' &&
      typeof item.targetDate === 'string' &&
      isFiniteNonNegative(item.totalIcuBeds) &&
      isFiniteNonNegative(item.currentAvailableBeds) &&
      isFiniteNonNegative(item.estimatedAvailableBeds) &&
      item.currentAvailableBeds <= item.totalIcuBeds &&
      item.estimatedAvailableBeds <= item.totalIcuBeds
    )
  ) {
    return false;
  }

  return true;
};

const loadPredictions = async (req, res, next) => {
  try {
    const contents = await fs.readFile(
      predictionsPath,
      'utf8'
    );

    const data = JSON.parse(contents);

    if (!isValidPredictions(data)) {
      return res.status(503).json({
        success: false,
        message: 'ML prediction snapshot is invalid'
      });
    }

    // Only expose the validated prediction document.
    req.mlPredictions = data;

    return next();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(503).json({
        success: false,
        message: (
          'ML predictions are unavailable. ' +
          'Run the Python prediction script first.'
        )
      });
    }

    // Do not expose filesystem paths or internal error details.
    console.error(
      '[ML analytics] Could not load prediction snapshot:',
      error.message
    );

    return res.status(503).json({
      success: false,
      message: 'ML prediction snapshot is unavailable'
    });
  }
};

const predictionResponse = (data, modelName, predictionKey) => ({
  success: true,
  source: data.source,
  simulated: data.simulated,
  trainingData: data.trainingData,
  modelVersion: data.modelVersion,
  evaluation: data.models[modelName],
  prediction: data.predictions[predictionKey],
  warning: data.warning
});

analyticsRouter.get(
  '/predictions/demand',
  loadPredictions,
  (req, res) => {
    return res.json(
      predictionResponse(
        req.mlPredictions,
        'demand',
        'demand'
      )
    );
  }
);

analyticsRouter.get(
  '/predictions/response-time',
  loadPredictions,
  (req, res) => {
    return res.json(
      predictionResponse(
        req.mlPredictions,
        'response_time',
        'responseTime'
      )
    );
  }
);

analyticsRouter.get(
  '/predictions/hospital-capacity',
  loadPredictions,
  (req, res) => {
    return res.json(
      predictionResponse(
        req.mlPredictions,
        'hospital_capacity',
        'hospitalCapacity'
      )
    );
  }
);

app.use('/api/v1/analytics', analyticsRouter);

// IMPORTANT:
// Events and Notifications are internal services.
// Do not register them using app.use().

module.exports = app;
