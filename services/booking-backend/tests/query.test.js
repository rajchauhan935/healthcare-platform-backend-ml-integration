
jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));

const pool = require('../src/config/db');
const { query } = require('../src/utils/query');

describe('Safe database query helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes SQL and parameters separately', async () => {
    pool.query.mockResolvedValue({
      rows: [{ ambulance_id: 'AMB-001' }],
      rowCount: 1,
    });

    const result = await query(
      'SELECT id AS ambulance_id FROM ambulances WHERE id = $1',
      ['AMB-001']
    );

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT id AS ambulance_id FROM ambulances WHERE id = $1',
      ['AMB-001']
    );

    expect(result.rows).toEqual([
      { ambulanceId: 'AMB-001' },
    ]);
    expect(result.rowCount).toBe(1);
  });

  test('rejects invalid parameter containers', async () => {
    await expect(query('SELECT 1', 'not-an-array'))
      .rejects.toThrow(TypeError);

    expect(pool.query).not.toHaveBeenCalled();
  });
});
