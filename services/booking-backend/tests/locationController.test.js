jest.mock('../src/config/db', () => ({
  connect: jest.fn(),
  query: jest.fn(),
}));

const pool = require('../src/config/db');

const {
  updateAmbulanceLocation,
  getAmbulanceLocationHistory,
} = require('../src/controllers/locationController');

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Ambulance location APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects invalid GPS coordinates', async () => {
    const req = {
      params: { id: 'AMB-001' },
      body: { lat: 120, lng: 83.3732 },
    };
    const res = mockResponse();

    await updateAmbulanceLocation(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('returns 404 when ambulance does not exist', async () => {
    const client = {
        query: jest.fn(async (sql) => {
        if (sql === 'BEGIN') return {};
        if (sql.includes('SELECT id FROM ambulances')) {
            return { rowCount: 0, rows: [] };
        }
        if (sql === 'ROLLBACK') return {};

        return { rows: [], rowCount: 0 };
        }),
        release: jest.fn(),
    };

    pool.connect.mockResolvedValue(client);

    const req = {
        params: { id: 'AMB-999' },
        body: { lat: 26.7606, lng: 83.3732 },
    };
    const res = mockResponse();

    await updateAmbulanceLocation(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.code)
        .toBe('AMBULANCE_NOT_FOUND');
    expect(client.release).toHaveBeenCalled();
    });

  test('returns location history for an existing ambulance', async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '1',
            ambulance_id: 'AMB-001',
            lat: 26.7606,
            lng: 83.3732,
            recorded_at: '2026-10-13T16:10:57.453Z',
          },
        ],
      });

    const req = {
      params: { id: 'AMB-001' },
      query: { limit: '20' },
    };
    const res = mockResponse();

    await getAmbulanceLocationHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);

    const response = res.json.mock.calls[0][0];

    expect(response.count).toBe(1);
    expect(response.data[0].ambulanceId).toBe('AMB-001');
  });

  test('returns 404 for history of an unknown ambulance', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 });

    const req = {
      params: { id: 'AMB-999' },
      query: {},
    };
    const res = mockResponse();

    await getAmbulanceLocationHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});