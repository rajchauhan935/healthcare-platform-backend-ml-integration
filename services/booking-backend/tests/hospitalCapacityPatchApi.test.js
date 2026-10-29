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

describe('Hospital capacity PATCH HTTP API', () => {
  const current = {
    id: 'H-001',
    name: 'Synthetic Test Hospital',
    generalBedsTotal: 100,
    generalBedsFree: 40,
    icuBedsTotal: 20,
    icuBedsFree: 5,
  };

  function createTestApp(options = {}) {
    const repository = {
      findHospitalById: jest.fn().mockResolvedValue(
        options.missingHospital ? null : { ...current }
      ),

      updateCapacity: jest.fn().mockImplementation(
        async (hospitalId, capacity) => ({
          id: hospitalId,
          ...capacity,
        })
      ),
    };

    if (options.noPersistence) {
      delete repository.updateCapacity;
    }

    const controller =
      createHospitalCapacityController(repository);

    function mockAuthenticate(req, res, next) {
      if (options.unauthenticated) {
        return res.status(401).json({
          error: 'Authentication required',
        });
      }

      // Synthetic identity. Not a real JWT.
      req.user = options.user || {
        id: 'U-001',
        role: 'ops',
      };

      return next();
    }

    // Synthetic ownership lookup - no PostgreSQL connection.
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

  test('accepts a valid partial capacity update', async () => {
    const { app, repository } = createTestApp();

    const response = await request(app)
      .patch('/api/hospital-capacity/H-001')
      .send({ generalBedsFree: 35 });

    expect(response.status).toBe(200);
    expect(response.body.hospital.generalBedsFree).toBe(35);
    expect(repository.updateCapacity).toHaveBeenCalledTimes(1);
  });

  test('rejects an unauthenticated request', async () => {
    const { app, repository } = createTestApp({
      unauthenticated: true,
    });

    const response = await request(app)
      .patch('/api/hospital-capacity/H-001')
      .send({ icuBedsFree: 4 });

    expect(response.status).toBe(401);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('rejects updating another hospital', async () => {
    const { app, repository } = createTestApp();

    const response = await request(app)
      .patch('/api/hospital-capacity/H-002')
      .send({ icuBedsFree: 4 });

    expect(response.status).toBe(403);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('rejects unverified hospital ownership', async () => {
    const { app, repository } = createTestApp({
      noOwnership: true,
    });

    const response = await request(app)
      .patch('/api/hospital-capacity/H-001')
      .send({ icuBedsFree: 4 });

    expect(response.status).toBe(403);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('rejects capacity exceeding the total', async () => {
    const { app, repository } = createTestApp();

    const response = await request(app)
      .patch('/api/hospital-capacity/H-001')
      .send({ generalBedsFree: 101 });

    expect(response.status).toBe(400);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('rejects an empty update', async () => {
    const { app, repository } = createTestApp();

    const response = await request(app)
      .patch('/api/hospital-capacity/H-001')
      .send({});

    expect(response.status).toBe(400);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('returns 404 for a missing hospital', async () => {
    const { app, repository } = createTestApp({
      missingHospital: true,
    });

    const response = await request(app)
      .patch('/api/hospital-capacity/H-001')
      .send({ icuBedsFree: 4 });

    expect(response.status).toBe(404);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('returns 503 when persistence is not configured', async () => {
    const { app } = createTestApp({
      noPersistence: true,
    });

    const response = await request(app)
      .patch('/api/hospital-capacity/H-001')
      .send({ icuBedsFree: 4 });

    expect(response.status).toBe(503);
  });
});
