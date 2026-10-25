
jest.mock('../src/utils/query', () => ({
  query: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { query } = require('../src/utils/query');

const ambulanceRoutes = require('../src/routes/ambulanceRoutes');
const hospitalRoutes = require('../src/routes/hospitalRoutes');

const app = express();
app.use(express.json());
app.use('/api/ambulances', ambulanceRoutes);
app.use('/api/hospitals', hospitalRoutes);

describe('Ambulance and hospital APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('lists available ambulances', async () => {
    query.mockResolvedValue({
      rows: [
        { id: 'AMB-001', type: 'ICU', status: 'available' },
      ],
      rowCount: 1,
    });

    const response = await request(app)
      .get('/api/ambulances?status=available');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe('AMB-001');
  });

  test('rejects an invalid ambulance status', async () => {
    const response = await request(app)
      .get('/api/ambulances?status=invalid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });

  test('returns 404 for an unknown ambulance', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    const response = await request(app)
      .get('/api/ambulances/UNKNOWN');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  test('lists hospitals with pagination', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ total: 20 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'HOS-001', name: 'Demo Hospital 001' },
        ],
        rowCount: 1,
      });

    const response = await request(app)
      .get('/api/hospitals?limit=5&offset=0');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.count).toBe(20);
    expect(response.body.limit).toBe(5);
    expect(response.body.offset).toBe(0);
  });

  test('rejects an invalid hospital category', async () => {
    const response = await request(app)
      .get('/api/hospitals?category=invalid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });
});
