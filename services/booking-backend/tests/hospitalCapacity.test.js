const {
  validateCapacity,
  validateAvailability,
} = require('../src/validators/hospitalCapacityValidator');

describe('Hospital capacity validation', () => {
  const allowedFields = [
    'generalBedsTotal',
    'generalBedsFree',
    'icuBedsTotal',
    'icuBedsFree',
  ];

  test('accepts valid non-negative capacity', () => {
    const result = validateCapacity(
      { generalBedsTotal: 100, generalBedsFree: 40 },
      allowedFields
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('rejects negative capacity', () => {
    const result = validateCapacity(
      { icuBedsFree: -1 },
      allowedFields
    );

    expect(result.valid).toBe(false);
  });

  test('rejects decimal capacity', () => {
    const result = validateCapacity(
      { icuBedsFree: 2.5 },
      allowedFields
    );

    expect(result.valid).toBe(false);
  });

  test('rejects unknown fields', () => {
    const result = validateCapacity(
      { hospitalId: 123 },
      allowedFields
    );

    expect(result.valid).toBe(false);
  });

  test('rejects empty updates', () => {
    expect(validateCapacity({}, allowedFields).valid).toBe(false);
  });

  test('rejects available beds greater than total', () => {
    expect(validateAvailability(10, 12, 'ICU').valid).toBe(false);
  });

  test('accepts available beds equal to total', () => {
    expect(validateAvailability(10, 10, 'ICU').valid).toBe(true);
  });

  test('rejects negative total capacity', () => {
    expect(validateAvailability(-1, 0, 'General').valid).toBe(false);
  });
});
