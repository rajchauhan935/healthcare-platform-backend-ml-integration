'use strict';

const {
  validateCapacityUpdate,
} = require('../services/hospitalCapacityService');

function createHospitalCapacityController(repository) {
  if (
    !repository ||
    typeof repository.findHospitalById !== 'function'
  ) {
    throw new TypeError('A hospital capacity repository is required');
  }

  function checkHospitalAccess(req, res) {
    const hospitalId = req.params.hospitalId;

    if (typeof hospitalId !== 'string' || !hospitalId.trim()) {
      res.status(400).json({
        error: 'A valid hospital ID is required',
      });
      return false;
    }

    // Only a trusted middleware may populate req.user.hospitalId.
    // The existing live authentication middleware does not yet do so.
    if (!req.user || !req.user.hospitalId) {
      res.status(403).json({
        error: 'Hospital access has not been verified',
      });
      return false;
    }

    if (req.user.hospitalId !== hospitalId) {
      res.status(403).json({
        error: 'Access to this hospital is forbidden',
      });
      return false;
    }

    return true;
  }

  async function getHospitalCapacity(req, res) {
    if (!checkHospitalAccess(req, res)) return;

    try {
      const hospital = await repository.findHospitalById(
        req.params.hospitalId
      );

      if (!hospital) {
        return res.status(404).json({
          error: 'Hospital not found',
        });
      }

      return res.status(200).json({ hospital });
    } catch (error) {
      return res.status(500).json({
        error: 'Unable to retrieve hospital capacity',
      });
    }
  }

  async function updateHospitalCapacity(req, res) {
    if (!checkHospitalAccess(req, res)) return;

    // Fail closed until an approved persistence implementation
    // is injected. No database update can occur otherwise.
    if (typeof repository.updateCapacity !== 'function') {
      return res.status(503).json({
        error: 'Hospital capacity updates are not configured',
      });
    }

    try {
      const current = await repository.findHospitalById(
        req.params.hospitalId
      );

      if (!current) {
        return res.status(404).json({
          error: 'Hospital not found',
        });
      }

      const validation = validateCapacityUpdate(
        current,
        req.body
      );

      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid hospital capacity',
          details: validation.errors,
        });
      }

      const updated = await repository.updateCapacity(
        req.params.hospitalId,
        validation.data
      );

      if (!updated) {
        return res.status(404).json({
          error: 'Hospital not found',
        });
      }

      return res.status(200).json({
        hospital: updated,
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Unable to update hospital capacity',
      });
    }
  }

  return {
    getHospitalCapacity,
    updateHospitalCapacity,
  };
}

module.exports = {
  createHospitalCapacityController,
};
