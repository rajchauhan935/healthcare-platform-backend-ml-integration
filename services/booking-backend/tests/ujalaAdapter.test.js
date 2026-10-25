const {
  toUjalaRequest,
  fromUjalaResponse,
} = require('../src/services/ujalaAdapter');

describe('Ujala adapter', () => {
  test('translates Kartik categories to Ujala categories', () => {
    const result = toUjalaRequest({
      emergencyType: 'trauma',
      patientLat: 26.75,
      patientLng: 83.35,
      ambulances: [{ id: 'AMB-001', type: 'ALS' }],
      hospitals: [{
        id: 'HOS-001',
        category: 'trauma',
        icuBedsFree: 5,
        pmjayEmpanelled: true,
      }],
    });

    expect(result.emergencyType).toBe('accident_trauma');
    expect(result.ambulances[0].category).toBe('ALS');
    expect(result.hospitals[0].category)
      .toBe('trauma_capable_emergency_hospital');
    expect(result.hospitals[0].freeBeds).toBe(5);
  });

  test('converts Ujala response to Kartik format', () => {
    const result = fromUjalaResponse({
      ambulanceType: 'BLS',
      hospitalCategory: 'general_emergency_hospital',
      topHospitals: [{ id: 'HOS-006', score: 0.8 }],
      reason: 'Synthetic demo recommendation',
    }, [
      { id: 'AMB-010', type: 'BLS', distanceKm: 1.2 },
    ]);

    expect(result.ambulanceId).toBe('AMB-010');
    expect(result.hospitalCategory).toBe('general');
    expect(result.topHospitals).toEqual(['HOS-006']);
  });

  test('rejects incompatible ambulance types', () => {
    expect(() => fromUjalaResponse({
      ambulanceType: 'ALS',
      hospitalCategory: 'general_emergency_hospital',
      topHospitals: [],
      reason: 'Synthetic demo',
    }, [
      { id: 'AMB-010', type: 'ICU', distanceKm: 1 },
    ])).toThrow('does not match');
  });
});
