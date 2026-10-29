'use strict';

const {
  createHospitalCapacityController,
} = require('../src/controllers/hospitalCapacityController');

describe('Hospital capacity GET controller', () => {
  const hospital = {
    id: 'H-001',
    name: 'Synthetic Test Hospital',
    icuBedsFree: 5,
    ventilatorsFree: 2,
  };

  function makeResponse() {
    const res = {};

    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);

    return res;
  }

  function makeRepository(result = hospital) {
    return {
      findHospitalById: jest.fn().mockResolvedValue(result),
    };
  }

  test('requires a repository', () => {
    expect(() => createHospitalCapacityController())
      .toThrow('A hospital capacity repository is required');
  });

  test('returns capacity for a verified matching hospital', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);

    const req = {
      params: { hospitalId: 'H-001' },
      user: { id: 'U-001', hospitalId: 'H-001' },
    };

    const res = makeResponse();

    await controller.getHospitalCapacity(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ hospital });
    expect(repository.findHospitalById).toHaveBeenCalledWith('H-001');
  });

  test('rejects a request without verified hospital ownership', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);

    const req = {
      params: { hospitalId: 'H-001' },
      user: { id: 'U-001' },
    };

    const res = makeResponse();

    await controller.getHospitalCapacity(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(repository.findHospitalById).not.toHaveBeenCalled();
  });

  test('rejects access to another hospital', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);

    const req = {
      params: { hospitalId: 'H-002' },
      user: { id: 'U-001', hospitalId: 'H-001' },
    };

    const res = makeResponse();

    await controller.getHospitalCapacity(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(repository.findHospitalById).not.toHaveBeenCalled();
  });

  test('rejects a missing hospital ID', async () => {
    const repository = makeRepository();
    const controller = createHospitalCapacityController(repository);

    const req = {
      params: {},
      user: { id: 'U-001', hospitalId: 'H-001' },
    };

    const res = makeResponse();

    await controller.getHospitalCapacity(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(repository.findHospitalById).not.toHaveBeenCalled();
  });

  test('returns 404 when the hospital does not exist', async () => {
    const repository = makeRepository(null);
    const controller = createHospitalCapacityController(repository);

    const req = {
      params: { hospitalId: 'H-001' },
      user: { id: 'U-001', hospitalId: 'H-001' },
    };

    const res = makeResponse();

    await controller.getHospitalCapacity(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('handles repository errors safely', async () => {
    const repository = {
      findHospitalById: jest.fn().mockRejectedValue(
        new Error('Synthetic database failure')
      ),
    };

    const controller = createHospitalCapacityController(repository);

    const req = {
      params: { hospitalId: 'H-001' },
      user: { id: 'U-001', hospitalId: 'H-001' },
    };

    const res = makeResponse();

    await controller.getHospitalCapacity(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to retrieve hospital capacity',
    });
  });
});
