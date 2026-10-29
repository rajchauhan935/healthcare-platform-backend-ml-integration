'use strict';

const express = require('express');
const request = require('supertest');

const {
  createHospitalCapacityController,
} = require('../src/controllers/hospitalCapacityController');

const {
  createHospitalCapacityRoutes,
} = require('../src/routes/hospitalCapacityRoutes');

const {
  createHospitalOwnershipMiddleware,
} = require('../src/middleware/hospitalOwnership');

describe('Hospital capacity GET API', () => {
  const hospital = {
    id: 'H-001',
    name: 'Synthetic Test Hospital',
    icuBedsFree: 5,
    ventilatorsFree: 2,
  };

  function createTestApp(options = {}) {
    const repository = {
      findHospitalById: jest.fn().mockResolvedValue(
        options.hospital === undefined
          ? hospital
          : options.hospital
      ),
    };

    const controller =
      createHospitalCapacityController(repository);

    // Synthetic authentication only.
    // This does not generate or verify a real JWT.
    function mockAuthenticate(req, res, next) {
      if (options.unauthenticated) {
        return res.status(401).json({
          error: 'Authentication required',
        });
      }

      req.user = options.user || {
        id: 'U-001',
        role: 'ops',
      };

      return next();
    }

    const findHospitalForUser = jest.fn().mockImplementation(
      async (userId) => {
        if (options.noOwnership || userId !== 'U-001') {
          return null;
        }

        return 'H-001';
        }
      );

    const verifyHospitalOwnership =
      createHospitalOwnershipMiddleware(findHospitalForUser);

    const app = express();

    app.use(express.json());

    app.use(
      '/api/hospital-capacity',
      createHospitalCapacityRoutes(
        controller,
        mockAuthenticate,
        verifyHospitalOwnership
      )
    );

    return { app, repository };
  }

  test('returns capacity for the matching hospital', async () => {
    const { app, repository } = createTestApp();

    const response = await request(app)
      .get('/api/hospital-capacity/H-001');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hospital });

    expect(repository.findHospitalById)
      .toHaveBeenCalledWith('H-001');
  });

  test('rejects unauthenticated requests', async () => {
    const { app, repository } = createTestApp({
      unauthenticated: true,
    });

    const response = await request(app)
      .get('/api/hospital-capacity/H-001');

    expect(response.status).toBe(401);

    expect(repository.findHospitalById)
      .not.toHaveBeenCalled();
  });

  test('rejects access to another hospital', async () => {
    const { app, repository } = createTestApp();

    const response = await request(app)
      .get('/api/hospital-capacity/H-002');

    expect(response.status).toBe(403);

    expect(repository.findHospitalById)
      .not.toHaveBeenCalled();
  });

  test('rejects users without verified hospital ownership', async () => {
    const { app, repository } = createTestApp({
      noOwnership: true,
    });

    const response = await request(app)
      .get('/api/hospital-capacity/H-001');

    expect(response.status).toBe(403);

    expect(repository.findHospitalById)
      .not.toHaveBeenCalled();
  });

  test('returns 404 for a missing hospital', async () => {
    const { app } = createTestApp({
      hospital: null,
    });

    const response = await request(app)
      .get('/api/hospital-capacity/H-001');

    expect(response.status).toBe(404);
  });
});
