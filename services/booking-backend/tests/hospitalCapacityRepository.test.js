'use strict';

const {
  createHospitalCapacityRepository,
} = require('../src/repositories/hospitalCapacityRepository');

describe('Hospital capacity repository', () => {
  test('requires an injected query function', () => {
    expect(() => createHospitalCapacityRepository())
      .toThrow('A database query function is required');
  });

  test('retrieves an existing hospital', async () => {
    const hospital = {
      id: 'H-001',
      name: 'Synthetic Test Hospital',
      icuBedsFree: 5,
      ventilatorsFree: 2,
    };

    const query = jest.fn().mockResolvedValue({
      rows: [hospital],
    });

    const repository = createHospitalCapacityRepository(query);

    const result = await repository.findHospitalById('H-001');

    expect(result).toEqual(hospital);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['H-001']);
  });

  test('returns null when hospital is missing', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [],
    });

    const repository = createHospitalCapacityRepository(query);

    await expect(
      repository.findHospitalById('H-MISSING')
    ).resolves.toBeNull();
  });

  test('rejects an empty hospital ID', async () => {
    const query = jest.fn();

    const repository = createHospitalCapacityRepository(query);

    await expect(
      repository.findHospitalById('')
    ).rejects.toThrow('A valid hospital ID is required');

    expect(query).not.toHaveBeenCalled();
  });

  test('uses a parameterized query', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [],
    });

    const repository = createHospitalCapacityRepository(query);

    await repository.findHospitalById('H-002');

    const [sql, params] = query.mock.calls[0];

    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual(['H-002']);
  });
});
