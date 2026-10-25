jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));

const pool = require('../src/config/db');
const { getNearbyAmbulances } = require('../src/controllers/ambulanceController');

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Nearby ambulances API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns nearby ambulances sorted by distance', async () => {
    pool.query.mockResolvedValue({
      rows: [
        {
          id: 'AMB-001',
          type: 'ICU',
          status: 'available',
          lat: 26.7606,
          lng: 83.3732,
          driver_name: 'Demo Driver 001',
          registration_no: 'UP53AB001',
          distance_km: '0',
        },
        {
          id: 'AMB-006',
          type: 'ALS',
          status: 'available',
          lat: 26.76,
          lng: 83.37,
          driver_name: 'Demo Driver 006',
          registration_no: 'UP53AB006',
          distance_km: '0.32',
        },
      ],
    });

    const req = {
      query: { lat: '26.7606', lng: '83.3732' },
    };
    const res = mockResponse();

    await getNearbyAmbulances(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const response = res.json.mock.calls[0][0];

    expect(response.count).toBe(2);
    expect(response.data[0].id).toBe('AMB-001');
    expect(response.data[0].distanceKm).toBe(0);
    expect(response.data[1].distanceKm).toBe(0.32);
  });

  test('rejects invalid latitude', async () => {
    const req = {
      query: { lat: '120', lng: '83.3732' },
    };
    const res = mockResponse();

    await getNearbyAmbulances(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code)
      .toBe('VALIDATION_ERROR');

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects missing coordinates', async () => {
    const req = {
      query: { lat: '26.7606' },
    };
    const res = mockResponse();

    await getNearbyAmbulances(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('returns 500 when the database query fails', async () => {
    pool.query.mockRejectedValue(new Error('Database failure'));

    const req = {
      query: { lat: '26.7606', lng: '83.3732' },
    };
    const res = mockResponse();

    await getNearbyAmbulances(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.code)
      .toBe('INTERNAL_ERROR');
  });
});