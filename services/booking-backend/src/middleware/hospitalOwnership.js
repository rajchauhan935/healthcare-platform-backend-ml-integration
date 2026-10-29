'use strict';

function createHospitalOwnershipMiddleware(findHospitalForUser) {
  if (typeof findHospitalForUser !== 'function') {
    throw new TypeError('A trusted hospital ownership lookup is required');
  }

  return async function verifyHospitalOwnership(req, res, next) {
    // The authenticated user ID must come from trusted JWT middleware.
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    // Never trust a hospital association supplied by the request.
    // Clear any pre-existing hospitalId before resolving ownership.
    delete req.user.hospitalId;

    try {
      const hospitalId = await findHospitalForUser(req.user.id);

      if (typeof hospitalId !== 'string' || !hospitalId.trim()) {
        return res.status(403).json({
          error: 'No verified hospital association',
        });
      }

      req.user.hospitalId = hospitalId;
      return next();
    } catch (error) {
      return res.status(503).json({
        error: 'Unable to verify hospital association',
      });
    }
  };
}

module.exports = {
  createHospitalOwnershipMiddleware,
};
