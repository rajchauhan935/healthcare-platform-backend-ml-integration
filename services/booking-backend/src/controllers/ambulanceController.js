
const { query } = require('../utils/query');

const ALLOWED_TYPES = ['BLS', 'ALS', 'ICU', 'NEONATAL'];
const ALLOWED_STATUSES = ['available', 'busy', 'offline'];

async function listAmbulances(req, res) {
  try {
    const { status, type } = req.query;

    if (status && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid ambulance status',
          allowedValues: ALLOWED_STATUSES,
        },
      });
    }

    if (type && !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid ambulance type',
          allowedValues: ALLOWED_TYPES,
        },
      });
    }

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const result = await query(
      `SELECT id, type, status, lat, lng, driver_name,
              registration_no, updated_at
       FROM ambulances
       ${where}
       ORDER BY id`,
      params
    );

    return res.status(200).json({
      data: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    console.error('List ambulances failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

async function getAmbulance(req, res) {
  try {
    const result = await query(
      `SELECT id, type, status, lat, lng, driver_name,
              registration_no, updated_at
       FROM ambulances
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Ambulance not found' },
      });
    }

    return res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    console.error('Get ambulance failed:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

const pool = require('../config/db');

async function getNearbyAmbulances(req, res) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (
    req.query.lat === undefined ||
    req.query.lng === undefined ||
    req.query.lat.trim?.() === '' ||
    req.query.lng.trim?.() === '' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Valid latitude and longitude are required.',
      },
    });
  }

  try {
    const result = await pool.query(
      `SELECT
        id,
        type,
        status,
        lat,
        lng,
        driver_name,
        registration_no,
        (
          6371 * acos(
            LEAST(1, GREATEST(-1,
              cos(radians($1)) *
              cos(radians(lat)) *
              cos(radians(lng) - radians($2)) +
              sin(radians($1)) *
              sin(radians(lat))
            ))
          )
        ) AS distance_km
      FROM ambulances
      WHERE status = 'available'
        AND lat IS NOT NULL
        AND lng IS NOT NULL
      ORDER BY distance_km ASC
      LIMIT 10`,
      [lat, lng]
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      lat: row.lat,
      lng: row.lng,
      driverName: row.driver_name,
      registrationNo: row.registration_no,
      distanceKm: Number(Number(row.distance_km).toFixed(2)),
    }));

    return res.status(200).json({
      data,
      count: data.length,
    });
  } catch (error) {
    console.error('Error finding nearby ambulances:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to find nearby ambulances.',
      },
    });
  }
}


module.exports = { listAmbulances, getAmbulance, getNearbyAmbulances, };
