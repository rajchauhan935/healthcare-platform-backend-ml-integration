
jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const pool = require('../src/config/db');

process.env.JWT_SECRET = 'test-only-secret-for-jest';

const { authenticate } = require('../src/middleware/auth');
const bookingRoutes = require('../src/routes/bookingRoutes');

const app = express();
app.use(express.json());

// Inject a demo authenticated user for these route tests.
// JWT verification is tested separately.
app.use('/api/bookings', (req, res, next) => {
  req.user = { id: 'U-001', role: 'ops' };
  next();
});

// The booking router also runs authenticate, so provide a valid token
// by mocking JWT verification for this isolated test suite.
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ sub: 'U-001', role: 'ops' })),
}));

app.use('/api/bookings', bookingRoutes);

describe('Booking status validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects an invalid booking status', async () => {
    const response = await request(app)
      .patch('/api/bookings/BK-0001/status')
      .set('Authorization', 'Bearer test-token')
      .send({ status: 'flying' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('rejects an ETA greater than 600 minutes', async () => {
    const response = await request(app)
      .patch('/api/bookings/BK-0001/status')
      .set('Authorization', 'Bearer test-token')
      .send({ status: 'dispatched', etaMinutes: 900 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('rejects a negative ETA', async () => {
    const response = await request(app)
      .patch('/api/bookings/BK-0001/status')
      .set('Authorization', 'Bearer test-token')
      .send({ status: 'dispatched', etaMinutes: -1 });

    expect(response.status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
