'use strict';

const {
  createHospitalCapacityController,
} = require('../src/controllers/hospitalCapacityController');

describe('Hospital capacity security regression tests', () => {
  const current = {
    id: 'H-001',
    name: 'Synthetic Test Hospital',
    generalBedsTotal: 100,
    generalBedsFree: 40,
    icuBedsTotal: 20,
    icuBedsFree: 5,
  };

  function response() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  function repository() {
    return {
      findHospitalById: jest.fn().mockResolvedValue(current),
      updateCapacity: jest.fn().mockResolvedValue(current),
    };
  }

  test('GET rejects unauthenticated access', async () => {
    const repo = repository();
    const controller = createHospitalCapacityController(repo);
    const res = response();

    await controller.getHospitalCapacity(
      {
        params: { hospitalId: 'H-001' },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(repo.findHospitalById).not.toHaveBeenCalled();
  });

  test('PATCH rejects client-supplied ownership without verified user', async () => {
    const repo = repository();
    const controller = createHospitalCapacityController(repo);
    const res = response();

    await controller.updateHospitalCapacity(
      {
        params: { hospitalId: 'H-001' },
        body: {
          hospitalId: 'H-001',
          generalBedsFree: 35,
        },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(repo.updateCapacity).not.toHaveBeenCalled();
  });

  test('PATCH rejects a user associated with another hospital', async () => {
    const repo = repository();
    const controller = createHospitalCapacityController(repo);
    const res = response();

    await controller.updateHospitalCapacity(
      {
        params: { hospitalId: 'H-002' },
        user: {
          id: 'U-001',
          hospitalId: 'H-001',
        },
        body: { icuBedsFree: 4 },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(repo.findHospitalById).not.toHaveBeenCalled();
    expect(repo.updateCapacity).not.toHaveBeenCalled();
  });

  test('PATCH rejects hospitalId inside the update payload', async () => {
    const repo = repository();
    const controller = createHospitalCapacityController(repo);
    const res = response();

    await controller.updateHospitalCapacity(
      {
        params: { hospitalId: 'H-001' },
        user: {
          id: 'U-001',
          hospitalId: 'H-001',
        },
        body: {
          hospitalId: 'H-002',
          icuBedsFree: 4,
        },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(repo.updateCapacity).not.toHaveBeenCalled();
  });

  test('PATCH rejects an unsupported capacity field', async () => {
    const repo = repository();
    const controller = createHospitalCapacityController(repo);
    const res = response();

    await controller.updateHospitalCapacity(
      {
        params: { hospitalId: 'H-001' },
        user: {
          id: 'U-001',
          hospitalId: 'H-001',
        },
        body: {
          ventilatorsFree: 999,
        },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(repo.updateCapacity).not.toHaveBeenCalled();
  });
});
