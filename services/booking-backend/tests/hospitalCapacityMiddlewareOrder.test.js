'use strict';

const express = require('express');
const request = require('supertest');

const {
  createHospitalCapacityRoutes,
} = require('../src/routes/hospitalCapacityRoutes');

const {
  createHospitalOwnershipMiddleware,
} = require('../src/middleware/hospitalOwnership');

describe('Hospital capacity middleware integration', () => {
  function createTestApp(options = {}) {
    const executionOrder = [];

    function authenticate(req, res, next) {
      executionOrder.push('authenticate');

      if (options.unauthenticated) {
        return res.status(401).json({
          error: 'Authentication required',
        });
      }

      req.user = {
        id: 'U-001',
        role: 'ops',
      };

      return next();
    }

    const lookup = jest.fn().mockImplementation(async (userId) => {
      executionOrder.push('ownership');

      if (options.lookupFailure) {
        throw new Error('Synthetic lookup failure');
      }

      if (options.noOwnership || userId !== 'U-001') {
        return null;
      }

      return 'H-001';
    });

    const verifyHospitalOwnership =
      createHospitalOwnershipMiddleware(lookup);

    const controller = {
      getHospitalCapacity: jest.fn((req, res) => {
        executionOrder.push('controller');

        return res.status(200).json({
          hospitalId: req.user.hospitalId,
        });
      }),

      updateHospitalCapacity: jest.fn((req, res) => {
        executionOrder.push('controller');

        if (req.user.hospitalId !== req.params.hospitalId) {
          return res.status(403).json({
            error: 'Forbidden',
          });
        }

        return res.status(200).json({
          hospitalId: req.user.hospitalId,
        });
      }),
    };

    const app = express();
    app.use(express.json());

    app.use(
      '/api/hospital-capacity',
      createHospitalCapacityRoutes(
        controller,
        authenticate,
        verifyHospitalOwnership
      )
    );

    return {
      app,
      lookup,
      controller,
      executionOrder,
    };
  }

  test('executes GET middleware in the correct order', async () => {
    const context = createTestApp();

    const response = await request(context.app)
      .get('/api/hospital-capacity/H-001');

    expect(response.status).toBe(200);

    expect(context.executionOrder).toEqual([
      'authenticate',
      'ownership',
      'controller',
    ]);

    expect(context.lookup).toHaveBeenCalledWith('U-001');
  });

  test('executes PATCH middleware in the correct order', async () => {
    const context = createTestApp();

    const response = await request(context.app)
      .patch('/api/hospital-capacity/H-001')
      .send({ icuBedsFree: 4 });

    expect(response.status).toBe(200);

    expect(context.executionOrder).toEqual([
      'authenticate',
      'ownership',
      'controller',
    ]);
  });

  test('stops before ownership lookup when authentication fails', async () => {
    const context = createTestApp({
      unauthenticated: true,
    });

    const response = await request(context.app)
      .get('/api/hospital-capacity/H-001');

    expect(response.status).toBe(401);

    expect(context.executionOrder).toEqual([
      'authenticate',
    ]);

    expect(context.lookup).not.toHaveBeenCalled();
    expect(context.controller.getHospitalCapacity)
      .not.toHaveBeenCalled();
  });

  test('stops before controller when ownership is missing', async () => {
    const context = createTestApp({
      noOwnership: true,
    });

    const response = await request(context.app)
      .get('/api/hospital-capacity/H-001');

    expect(response.status).toBe(403);

    expect(context.executionOrder).toEqual([
      'authenticate',
      'ownership',
    ]);

    expect(context.controller.getHospitalCapacity)
      .not.toHaveBeenCalled();
  });

  test('fails closed when ownership lookup throws', async () => {
    const context = createTestApp({
      lookupFailure: true,
    });

    const response = await request(context.app)
      .patch('/api/hospital-capacity/H-001')
      .send({ icuBedsFree: 4 });

    expect(response.status).toBe(503);

    expect(context.controller.updateHospitalCapacity)
      .not.toHaveBeenCalled();
  });

  test('does not trust a forged hospital ID in the PATCH body', async () => {
    const context = createTestApp();

    const response = await request(context.app)
      .patch('/api/hospital-capacity/H-001')
      .send({
        hospitalId: 'H-999',
        icuBedsFree: 4,
      });

    expect(response.status).toBe(200);
    expect(response.body.hospitalId).toBe('H-001');

    expect(context.lookup).toHaveBeenCalledWith('U-001');
  });

  test('does not authorize a different hospital through PATCH', async () => {
    const context = createTestApp();

    const response = await request(context.app)
      .patch('/api/hospital-capacity/H-999')
      .send({ icuBedsFree: 4 });

    expect(response.status).toBe(403);
  });
});
