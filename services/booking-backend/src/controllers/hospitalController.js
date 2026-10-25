
const { query } = require('../utils/query');

const ALLOWED_CATEGORIES = [
  'cardiac', 'trauma', 'neuro', 'maternity', 'burns', 'general',
];

function parseBoolean(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

async function listHospitals(req, res) {
  try {
    const {
      category,
      pmjayEmpanelled,
      hasIcuBeds,
      limit = '50',
      offset = '0',
    } = req.query;

    if (category && !ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid hospital category',
          allowedValues: ALLOWED_CATEGORIES,
        },
      });
    }

    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100 ||
      !Number.isInteger(parsedOffset) ||
      parsedOffset < 0
    ) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'limit must be 1–100 and offset must be non-negative',
        },
      });
    }

    const filters = [];
    const params = [];

    if (category) {
      params.push(category);
      filters.push(`category = $${params.length}`);
    }

    if (pmjayEmpanelled !== undefined) {
      const value = parseBoolean(pmjayEmpanelled);

      if (value === null) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'pmjayEmpanelled must be true or false',
          },
        });
      }

      params.push(value);
      filters.push(`pmjay_empanelled = $${params.length}`);
    }

    if (hasIcuBeds !== undefined) {
      const value = parseBoolean(hasIcuBeds);

      if (value === null) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'hasIcuBeds must be true or false',
          },
        });
      }

      filters.push(value ? 'icu_beds_free > 0' : 'icu_beds_free = 0');
    }

    const where = filters.length
      ? `WHERE ${filters.join(' AND ')}`
      : '';

    // Use the same filter for both the data query and total count.
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM hospitals ${where}`,
      params
    );

    const dataParams = [...params, parsedLimit, parsedOffset];

    const result = await query(
      `SELECT id, name, category, icu_beds_free, ventilators_free,
              pmjay_empanelled, lat, lng, updated_at
       FROM hospitals
       ${where}
       ORDER BY id
       LIMIT $${dataParams.length - 1}
       OFFSET $${dataParams.length}`,
      dataParams
    );

    return res.status(200).json({
      data: result.rows,
      count: countResult.rows[0].total,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  } catch (error) {
    console.error('List hospitals failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

async function getHospital(req, res) {
  try {
    const result = await query(
      `SELECT id, name, category, icu_beds_free, ventilators_free,
              pmjay_empanelled, lat, lng, updated_at
       FROM hospitals
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Hospital not found' },
      });
    }

    return res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Get hospital failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

module.exports = { listHospitals, getHospital };
