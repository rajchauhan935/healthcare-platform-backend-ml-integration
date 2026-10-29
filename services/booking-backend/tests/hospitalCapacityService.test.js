const {
  validateCapacityUpdate,
} = require('../src/services/hospitalCapacityService');

describe('Hospital capacity business rules', () => {
  const current = {
    generalBedsTotal: 100,
    generalBedsFree: 40,
    icuBedsTotal: 20,
    icuBedsFree: 5,
  };

  test('accepts a valid partial update', () => {
    const result = validateCapacityUpdate(
      current,
      { generalBedsFree: 35 }
    );

    expect(result.valid).toBe(true);
    expect(result.data.generalBedsFree).toBe(35);
    expect(result.data.icuBedsFree).toBe(5);
  });

  test('rejects general beds exceeding total', () => {
    const result = validateCapacityUpdate(
      current,
      { generalBedsFree: 101 }
    );

    expect(result.valid).toBe(false);
  });

  test('rejects ICU beds exceeding total', () => {
    const result = validateCapacityUpdate(
      current,
      { icuBedsFree: 21 }
    );

    expect(result.valid).toBe(false);
  });

  test('rejects reducing total below available', () => {
    const result = validateCapacityUpdate(
      current,
      { generalBedsTotal: 20 }
    );

    expect(result.valid).toBe(false);
  });

  test('accepts a consistent simultaneous update', () => {
    const result = validateCapacityUpdate(
      current,
      {
        generalBedsTotal: 20,
        generalBedsFree: 10,
      }
    );

    expect(result.valid).toBe(true);
  });

  test('rejects negative values', () => {
    const result = validateCapacityUpdate(
      current,
      { icuBedsFree: -1 }
    );

    expect(result.valid).toBe(false);
  });

  test('rejects unsupported fields', () => {
    const result = validateCapacityUpdate(
      current,
      { hospitalId: 'H-002' }
    );

    expect(result.valid).toBe(false);
  });

  test('rejects missing existing capacity', () => {
    const result = validateCapacityUpdate(
      null,
      { icuBedsFree: 3 }
    );

    expect(result.valid).toBe(false);
  });
});
