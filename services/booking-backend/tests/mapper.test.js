
const {
  toCamelCase,
  mapToCamelCase,
} = require('../src/utils/mapper');

describe('Database mapper', () => {
  test('converts snake_case keys to camelCase', () => {
    expect(toCamelCase('driver_name')).toBe('driverName');
    expect(toCamelCase('created_at')).toBe('createdAt');
    expect(toCamelCase('icu_beds_free')).toBe('icuBedsFree');
  });

  test('maps an object without changing its values', () => {
    const input = {
      driver_name: 'Demo Driver',
      ambulance_id: 'AMB-001',
      eta_minutes: 12,
    };

    expect(mapToCamelCase(input)).toEqual({
      driverName: 'Demo Driver',
      ambulanceId: 'AMB-001',
      etaMinutes: 12,
    });
  });

  test('maps arrays of database rows', () => {
    const input = [
      { ambulance_id: 'AMB-001' },
      { ambulance_id: 'AMB-002' },
    ];

    expect(mapToCamelCase(input)).toEqual([
      { ambulanceId: 'AMB-001' },
      { ambulanceId: 'AMB-002' },
    ]);
  });
});
