'use strict';

const {
  validateCapacityUpdate,
} = require('../services/hospitalCapacityService');

/**
 * Experimental transaction repository.
 *
 * Uses an injected pool, never imports the live database pool.
 * SQL assumes a proposed capacity schema and must not be
 * activated until the schema is approved.
 */
function createHospitalCapacityTransactionRepository(pool) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('An injected database pool is required');
  }

  async function updateCapacity(hospitalId, patch) {
    if (typeof hospitalId !== 'string' || !hospitalId.trim()) {
      throw new TypeError('A valid hospital ID is required');
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const currentResult = await client.query(
        `SELECT
           id,
           general_beds_total AS "generalBedsTotal",
           general_beds_free AS "generalBedsFree",
           icu_beds_total AS "icuBedsTotal",
           icu_beds_free AS "icuBedsFree"
         FROM hospitals
         WHERE id = $1
         FOR UPDATE`,
        [hospitalId]
      );

      if (!currentResult.rows.length) {
        await client.query('COMMIT');
        transactionStarted = false;
        return null;
      }

      const validation = validateCapacityUpdate(
        currentResult.rows[0],
        patch
      );

      if (!validation.valid) {
        const error = new Error('Invalid hospital capacity');
        error.code = 'INVALID_CAPACITY';
        error.details = validation.errors;
        throw error;
      }

      const capacity = validation.data;

      const updatedResult = await client.query(
        `UPDATE hospitals
         SET general_beds_total = $2,
             general_beds_free = $3,
             icu_beds_total = $4,
             icu_beds_free = $5,
             updated_at = NOW()
         WHERE id = $1
         RETURNING
           id,
           general_beds_total AS "generalBedsTotal",
           general_beds_free AS "generalBedsFree",
           icu_beds_total AS "icuBedsTotal",
           icu_beds_free AS "icuBedsFree",
           updated_at AS "updatedAt"`,
        [
          hospitalId,
          capacity.generalBedsTotal,
          capacity.generalBedsFree,
          capacity.icuBedsTotal,
          capacity.icuBedsFree,
        ]
      );

      await client.query('COMMIT');
      transactionStarted = false;

      return updatedResult.rows[0] || null;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          // Preserve the original failure.
        }
      }

      throw error;
    } finally {
      client.release();
    }
  }

  return {
    updateCapacity,
  };
}

module.exports = {
  createHospitalCapacityTransactionRepository,
};
