'use strict';

const {
  createHospitalCapacityController,
} = require('../src/controllers/hospitalCapacityController');

describe('Hospital capacity PATCH controller', () => {
  const current = {
    id: 'H-001',
    name: 'Synthetic Test Hospital',
    generalBedsTotal: 100,
    generalBedsFree: 40,
    icuBedsTotal: 20,
    icuBedsFree: 5,
  };

  function makeResponse() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  function makeRequest(body, hospitalId = 'H-001', userHospitalId = 'H-001') {
    return {
      params: { hospitalId },
      user: {
        id: 'U-001',
        hospitalId: userHospitalId,
      },
      body,
    };
  }

  function makeRepository() {
    return {
      findHospitalById: jest.fn().mockResolvedValue({ ...current }),
      updateCapacity: jest.fn().mockImplementation(
        async (hospitalId, capacity) => ({
          id: hospitalId,
          name: current.name,
          ...capacity,
        })
      ),
    };
  }

  test('accepts a valid capacity update', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);
    const res = makeResponse();

    await controller.updateHospitalCapacity(
      makeRequest({ generalBedsFree: 35 }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(repository.updateCapacity).toHaveBeenCalledTimes(1);
    expect(repository.updateCapacity).toHaveBeenCalledWith(
      'H-001',
      expect.objectContaining({
        generalBedsTotal: 100,
        generalBedsFree: 35,
      })
    );
  });

  test('rejects available beds exceeding total', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);
    const res = makeResponse();

    await controller.updateHospitalCapacity(
      makeRequest({ generalBedsFree: 101 }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('rejects negative capacity values', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);
    const res = makeResponse();

    await controller.updateHospitalCapacity(
      makeRequest({ icuBedsFree: -1 }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('rejects updates to another hospital', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);
    const res = makeResponse();

    await controller.updateHospitalCapacity(
      makeRequest({ icuBedsFree: 4 }, 'H-002', 'H-001'),
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(repository.findHospitalById).not.toHaveBeenCalled();
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('rejects updates without verified hospital ownership', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);
    const res = makeResponse();

    const req = makeRequest({ icuBedsFree: 4 });
    req.user = { id: 'U-001' };

    await controller.updateHospitalCapacity(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('returns 404 when the hospital does not exist', async () => {
    const repository = makeRepository();
    repository.findHospitalById.mockResolvedValue(null);

    const controller = createHospitalCapacityController(repository);
    const res = makeResponse();

    await controller.updateHospitalCapacity(
      makeRequest({ icuBedsFree: 4 }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(repository.updateCapacity).not.toHaveBeenCalled();
  });

  test('returns 503 when persistence is not configured', async () => {
    const repository = {
      findHospitalById: jest.fn().mockResolvedValue(current),
    };

    const controller = createHospitalCapacityController(repository);
    const res = makeResponse();

    await controller.updateHospitalCapacity(
      makeRequest({ icuBedsFree: 4 }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(repository.findHospitalById).not.toHaveBeenCalled();
  });

  test('handles repository failures safely', async () => {
    const repository = makeRepository();
    repository.updateCapacity.mockRejectedValue(
      new Error('Synthetic persistence failure')
    );

    const controller = createHospitalCapacityController(repository);
    const res = makeResponse();

    await controller.updateHospitalCapacity(
      makeRequest({ icuBedsFree: 4 }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to update hospital capacity',
    });
  });
});
