'use strict';

const {
  createHospitalOwnershipMiddleware,
} = require('../src/middleware/hospitalOwnership');

describe('Hospital ownership middleware', () => {
  function response() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  test('requires an injected trusted lookup', () => {
    expect(() => createHospitalOwnershipMiddleware())
      .toThrow(TypeError);
  });

  test('rejects unauthenticated requests', async () => {
    const lookup = jest.fn();
    const middleware = createHospitalOwnershipMiddleware(lookup);
    const next = jest.fn();
    const res = response();

    await middleware({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(lookup).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('resolves hospital ownership from authenticated user ID', async () => {
    const lookup = jest.fn().mockResolvedValue('H-001');
    const middleware = createHospitalOwnershipMiddleware(lookup);
    const next = jest.fn();
    const res = response();
    const req = {
      user: { id: 'U-001', role: 'ops' },
      params: { hospitalId: 'H-001' },
    };

    await middleware(req, res, next);

    expect(lookup).toHaveBeenCalledWith('U-001');
    expect(req.user.hospitalId).toBe('H-001');
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('ignores a forged hospitalId in the request body', async () => {
    const lookup = jest.fn().mockResolvedValue('H-001');
    const middleware = createHospitalOwnershipMiddleware(lookup);
    const next = jest.fn();
    const res = response();
    const req = {
      user: { id: 'U-001', role: 'ops' },
      body: { hospitalId: 'H-999' },
    };

    await middleware(req, res, next);

    expect(req.user.hospitalId).toBe('H-001');
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('rejects users without a hospital association', async () => {
    const lookup = jest.fn().mockResolvedValue(null);
    const middleware = createHospitalOwnershipMiddleware(lookup);
    const next = jest.fn();
    const res = response();

    await middleware(
      { user: { id: 'U-002', role: 'ops' } },
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('removes an unverified pre-existing hospitalId', async () => {
    const lookup = jest.fn().mockResolvedValue(null);
    const middleware = createHospitalOwnershipMiddleware(lookup);
    const next = jest.fn();
    const res = response();
    const req = {
      user: {
        id: 'U-002',
        role: 'ops',
        hospitalId: 'H-FORGED',
      },
    };

    await middleware(req, res, next);

    expect(req.user.hospitalId).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('fails closed when the ownership lookup fails', async () => {
    const lookup = jest.fn().mockRejectedValue(
      new Error('Synthetic lookup failure')
    );

    const middleware = createHospitalOwnershipMiddleware(lookup);
    const next = jest.fn();
    const res = response();

    await middleware(
      { user: { id: 'U-001', role: 'ops' } },
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
