
const {
  haversineDistanceKm,
  validateRecommendation,
  validateEta,
  recommendAmbulance,
  estimateEta,
} = require('../src/services/aiClient');

describe('BE-10 AI Client', () => {
  beforeEach(() => {
    process.env.AI_MODE = 'mock';
  });

  test('calculates zero distance for identical coordinates', () => {
    const distance = haversineDistanceKm(
      26.7606, 83.3732,
      26.7606, 83.3732
    );

    expect(distance).toBeCloseTo(0);
  });

  test('selects the nearest ambulance in mock mode', async () => {
    const candidates = [
      { id: 'AMB-002', distanceKm: 5.2 },
      { id: 'AMB-001', distanceKm: 1.3 },
      { id: 'AMB-003', distanceKm: 8.0 },
    ];

    const result = await recommendAmbulance({}, candidates);

    expect(result.ambulanceId).toBe('AMB-001');
    expect(result.reason).toBeDefined();
  });

  test('calculates ETA in mock mode', async () => {
    const result = await estimateEta(
      {},
      { lat: 26.7606, lng: 83.3732 },
      { lat: 26.7706, lng: 83.3732 }
    );

    expect(result.etaMinutes).toBeGreaterThan(0);
    expect(Number.isInteger(result.etaMinutes)).toBe(true);
  });

  test('rejects an unknown ambulance recommendation', () => {
    const candidates = [
      { id: 'AMB-001', distanceKm: 1.3 },
    ];

    expect(() =>
      validateRecommendation(
        {
          ambulanceId: 'AMB-999',
          reason: 'Recommended ambulance',
        },
        candidates
      )
    ).toThrow('Invalid recommendation response');
  });

  test('rejects a recommendation with a missing ambulanceId', () => {
    const candidates = [
      { id: 'AMB-001', distanceKm: 1.3 },
    ];

    expect(() =>
      validateRecommendation(
        {
          reason: 'Recommended ambulance',
          topHospitals: [],
        },
        candidates
      )
    ).toThrow('Invalid recommendation response');
  });

  test('rejects a recommendation with invalid topHospitals', () => {
    const candidates = [
      { id: 'AMB-001', distanceKm: 1.3 },
    ];

    expect(() =>
      validateRecommendation(
        {
          ambulanceId: 'AMB-001',
          reason: 'Recommended ambulance',
          topHospitals: 'HOS-001',
        },
        candidates
      )
    ).toThrow('Invalid recommendation response');
  });

  test('rejects a recommendation with a missing reason', () => {
    const candidates = [
      { id: 'AMB-001', distanceKm: 1.3 },
    ];

    expect(() =>
      validateRecommendation(
        {
          ambulanceId: 'AMB-001',
          topHospitals: [],
        },
        candidates
      )
    ).toThrow('Invalid recommendation response');
  });

  test('rejects a recommendation with a mismatched ambulance type', () => {
    const candidates = [
      {
        id: 'AMB-001',
        type: 'ICU',
        distanceKm: 2,
      },
    ];

    const result = {
      ambulanceId: 'AMB-001',
      ambulanceType: 'BLS',
      hospitalCategory: 'cardiac',
      topHospitals: ['HOS-001'],
      reason: 'Nearest ambulance',
    };

    expect(() =>
      validateRecommendation(result, candidates)
    ).toThrow('Invalid recommendation response');
  });

  test('rejects an invalid ETA response', () => {
    expect(() =>
      validateEta({ etaMinutes: -10, distanceKm: 2 })
    ).toThrow('Invalid ETA response');
  });

  test('rejects an ETA without etaMinutes', () => {
    expect(() =>
      validateEta({ distanceKm: 2 })
    ).toThrow('Invalid ETA response');
  });

  test('rejects an ETA without distanceKm', () => {
    expect(() =>
      validateEta({ etaMinutes: 10 })
    ).toThrow('Invalid ETA response');
  });

  test('rejects a negative distanceKm', () => {
    expect(() =>
      validateEta({ etaMinutes: 10, distanceKm: -2 })
    ).toThrow('Invalid ETA response');
  });

  test('accepts a valid ETA response', () => {
    expect(
      validateEta({ etaMinutes: 10, distanceKm: 5.4 })
    ).toEqual({ etaMinutes: 10, distanceKm: 5.4 });
  });

});
