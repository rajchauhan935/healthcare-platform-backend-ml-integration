'use strict';

function createHospitalCapacityRepository(query) {
  if (typeof query !== 'function') {
    throw new TypeError('A database query function is required');
  }

  async function findHospitalById(hospitalId) {
    if (typeof hospitalId !== 'string' || !hospitalId.trim()) {
      throw new TypeError('A valid hospital ID is required');
    }

    const result = await query(
      `SELECT
         id,
         name,
         icu_beds_free AS "icuBedsFree",
         ventilators_free AS "ventilatorsFree",
         updated_at AS "updatedAt"
       FROM hospitals
       WHERE id = $1`,
      [hospitalId]
    );

    return result.rows[0] || null;
  }

  return {
    findHospitalById,
  };
}

module.exports = {
  createHospitalCapacityRepository,
};
