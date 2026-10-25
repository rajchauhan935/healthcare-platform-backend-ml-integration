
jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

jest.mock('../src/services/aiClient', () => ({
  haversineDistanceKm: jest.fn(() => 1),
  recommendAmbulance: jest.fn(),
  estimateEta: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ sub: 'U-001', role: 'ops' })),
}));

const express = require('express');
const request = require('supertest');
const pool = require('../src/config/db');
const {
  haversineDistanceKm,
  recommendAmbulance,
  estimateEta,
} = require('../src/services/aiClient');
const bookingRoutes = require('../src/routes/bookingRoutes');

process.env.JWT_SECRET = 'test-only-secret-for-jest';
process.env.AI_MODE = 'mock';

const app = express();
app.use(express.json());
app.use('/api/bookings', bookingRoutes);

describe('BE-10 booking AI integration', () => {
  let client;

  const ambulance = {
    id: 'AMB-TEST-01',
    type: 'ICU',
    lat: 26.76,
    lng: 83.37,
    distanceKm: 1,
  };

  const hospital = {
    id: 'HOS-TEST-01',
    category: 'cardiac',
    icuBedsFree: 4,
    pmjayEmpanelled: true,
    lat: 26.76,
    lng: 83.37,
  };

  const insertedBooking = {
    id: 'BK-TEST-01',
    patient_id: 'U-001',
    emergency_type: 'cardiac',
    pickup_lat: 26.75,
    pickup_lng: 83.38,
    ambulance_id: null,
    hospital_id: null,
    status: 'requested',
    eta_minutes: null,
    ai_status: 'pending',
    recommendation_reason: null,
    created_at: new Date('2026-10-14T08:00:00Z'),
    updated_at: new Date('2026-10-14T08:00:00Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_MODE = 'mock';

    client = {
      query: jest.fn(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes('SELECT id FROM users')) {
          return { rows: [{ id: 'U-001' }], rowCount: 1 };
        }

        if (sql.includes('INSERT INTO bookings')) {
          return { rows: [insertedBooking], rowCount: 1 };
        }

        if (sql.includes('SELECT id, status FROM ambulances')) {
          return {
            rows: [{ id: ambulance.id, status: 'available' }],
            rowCount: 1,
          };
        }

        throw new Error(`Unexpected client query: ${sql}`);
      }),
      release: jest.fn(),
    };


    pool.connect.mockResolvedValue(client);

    pool.query.mockImplementation(async (sql, params = []) => {
        if (sql.includes('FROM ambulances') && sql.includes('distanceKm')) {
            return { rows: [ambulance], rowCount: 1 };
        }

        if (sql.includes('FROM hospitals')) {
            return { rows: [hospital], rowCount: 1 };
        }

        if (sql.includes('UPDATE bookings')) {
            const isFallbackUpdate = sql.includes("ai_status = 'fallback'");

            return {
            rows: [{
                ...insertedBooking,
                ambulance_id: params[0] || ambulance.id,
                hospital_id: params[1] || hospital.id,
                eta_minutes: params[2] ?? 9,
                ai_status: isFallbackUpdate ? 'fallback' : params[3] || 'ok',
                recommendation_reason: isFallbackUpdate
                ? params[3]
                : params[4] || 'AI recommendation completed',
            }],
            rowCount: 1,
            };
        }

        throw new Error(`Unexpected pool query: ${sql}`);
    });

    recommendAmbulance.mockResolvedValue({
      ambulanceType: 'ICU',
      ambulanceId: ambulance.id,
      hospitalCategory: 'cardiac',
      topHospitals: [hospital.id],
      reason: 'Cardiac case needs ICU ambulance and cardiac centre',
    });

    estimateEta.mockResolvedValue({
      etaMinutes: 9,
      distanceKm: 4.2,
    });
  });

  test('creates a booking when AI recommendation and ETA succeed', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .set('Authorization', 'Bearer test-token')
      .send({
        emergencyType: 'cardiac',
        pickupLat: 26.75,
        pickupLng: 83.38,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: 'BK-TEST-01',
      emergencyType: 'cardiac',
      ambulanceId: ambulance.id,
      hospitalId: hospital.id,
      status: 'requested',
      etaMinutes: 9,
      aiStatus: 'ok',
      recommendationReason: 'AI recommendation completed',
    });


    expect(recommendAmbulance).toHaveBeenCalledTimes(1);
    expect(recommendAmbulance).toHaveBeenCalledWith(
        expect.objectContaining({
            emergencyType: 'cardiac',
            patientLat: 26.75,
            patientLng: 83.38,
            ambulances: [
            expect.objectContaining({
                id: ambulance.id,
                type: 'ICU',
                lat: ambulance.lat,
                lng: ambulance.lng,
            }),
            ],
            hospitals: [
            expect.objectContaining({
                id: hospital.id,
                category: 'cardiac',
                icuBedsFree: 4,
                pmjayEmpanelled: true,
                lat: hospital.lat,
                lng: hospital.lng,
            }),
            ],
        }),
        expect.any(Array)
        );
    expect(estimateEta).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE bookings'),
      expect.any(Array),
    );
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  test('keeps the booking when AI recommendation fails', async () => {
    recommendAmbulance.mockRejectedValue(
        new Error('AI service unavailable')
    );

    const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', 'Bearer test-token')
        .send({
        emergencyType: 'cardiac',
        pickupLat: 26.75,
        pickupLng: 83.38,
        });

    expect(response.status).toBe(201);

    expect(response.body.data).toMatchObject({
        id: 'BK-TEST-01',
        ambulanceId: ambulance.id,
        hospitalId: hospital.id,
        aiStatus: 'fallback',
    });

    expect(response.body.data.recommendationReason).toContain(
        'AI recommendation fallback'
    );

    expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE bookings'),
        expect.any(Array),
    );

    expect(estimateEta).not.toHaveBeenCalled();
    });

  test('keeps the booking when recommendation times out', async () => {
    recommendAmbulance.mockRejectedValue(
        new Error('Booking enrichment budget exceeded')
    );

    const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', 'Bearer test-token')
        .send({
        emergencyType: 'cardiac',
        pickupLat: 26.75,
        pickupLng: 83.38,
    });

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.aiStatus).toBe('fallback');
  });

    test('keeps the booking when the AI service returns HTTP 500', async () => {
    recommendAmbulance.mockRejectedValue(
        new Error('AI service returned HTTP 500')
    );

    const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', 'Bearer test-token')
        .send({
        emergencyType: 'cardiac',
        pickupLat: 26.75,
        pickupLng: 83.38,
        });

    expect(response.status).toBe(201);

    expect(response.body.data).toMatchObject({
        id: 'BK-TEST-01',
        ambulanceId: ambulance.id,
        hospitalId: hospital.id,
        aiStatus: 'fallback',
    });

    expect(response.body.data.recommendationReason).toContain(
        'AI recommendation fallback'
    );
    });

    test('keeps the booking when the AI recommendation is malformed', async () => {
        recommendAmbulance.mockRejectedValue(
            new Error('Invalid recommendation response')
        );

        const response = await request(app)
            .post('/api/bookings')
            .set('Authorization', 'Bearer test-token')
            .send({
            emergencyType: 'cardiac',
            pickupLat: 26.75,
            pickupLng: 83.38,
            });

        expect(response.status).toBe(201);

        expect(response.body.data).toMatchObject({
            id: 'BK-TEST-01',
            ambulanceId: ambulance.id,
            hospitalId: hospital.id,
            aiStatus: 'fallback',
        });

        expect(response.body.data.recommendationReason).toContain(
            'AI recommendation fallback'
        );
    });

    test('uses fallback when AI recommends an unavailable ambulance ID', async () => {
        recommendAmbulance.mockResolvedValue({
            ambulanceType: 'ICU',
            ambulanceId: 'AMB-DOES-NOT-EXIST',
            hospitalCategory: 'cardiac',
            topHospitals: [hospital.id],
            reason: 'Test recommendation with invalid ambulance',
        });

        const response = await request(app)
            .post('/api/bookings')
            .set('Authorization', 'Bearer test-token')
            .send({
            emergencyType: 'cardiac',
            pickupLat: 26.75,
            pickupLng: 83.38,
            });

        expect(response.status).toBe(201);

        expect(response.body.data).toMatchObject({
            id: 'BK-TEST-01',
            ambulanceId: ambulance.id,
            hospitalId: hospital.id,
            aiStatus: 'fallback',
        });

        expect(response.body.data.recommendationReason).toContain(
            'AI recommendation fallback'
        );
    });

    test('keeps the booking and calculates fallback ETA when ETA service fails', async () => {
        estimateEta.mockRejectedValue(
            new Error('ETA service unavailable')
        );

        const response = await request(app)
            .post('/api/bookings')
            .set('Authorization', 'Bearer test-token')
            .send({
            emergencyType: 'cardiac',
            pickupLat: 26.75,
            pickupLng: 83.38,
            });

        expect(response.status).toBe(201);

        expect(response.body.data).toMatchObject({
            id: 'BK-TEST-01',
            ambulanceId: ambulance.id,
            hospitalId: hospital.id,
            aiStatus: 'fallback',
        });

        expect(response.body.data.etaMinutes).toBe(2);
        expect(response.body.data.recommendationReason).toContain(
            'ETA fallback'
        );

        expect(haversineDistanceKm).toHaveBeenCalled();
    });
});
