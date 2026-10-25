
const {
  validateEnum,
  validateNumber,
} = require('../src/utils/validate');

describe('Shared validation utilities', () => {
  test('accepts a valid enum value', () => {
    expect(
      validateEnum('ICU', ['BLS', 'ALS', 'ICU', 'NEONATAL'], 'type')
    ).toBeNull();
  });

  test('rejects an invalid enum value', () => {
    expect(
      validateEnum('INVALID', ['ICU', 'ALS'], 'type')
    ).toMatchObject({
      field: 'type',
      message: 'Invalid type',
    });
  });

  test('accepts a number within range', () => {
    expect(validateNumber('25', 'limit', 1, 100)).toBeNull();
  });

  test('rejects a number outside range', () => {
    expect(validateNumber('150', 'limit', 1, 100)).toMatchObject({
      field: 'limit',
    });
  });
});
