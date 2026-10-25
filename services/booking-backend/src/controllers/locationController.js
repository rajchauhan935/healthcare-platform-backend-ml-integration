const pool = require('../config/db');

async function updateAmbulanceLocation(req, res) {
  const { id } = req.params;
  const { lat, lng } = req.body;

  // Validate GPS coordinates
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
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
        message: 'Valid numeric latitude and longitude are required.',
      },
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Check whether the ambulance exists
    const ambulance = await client.query(
      'SELECT id FROM ambulances WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (ambulance.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: {
          code: 'AMBULANCE_NOT_FOUND',
          message: 'Ambulance not found.',
        },
      });
    }

    // Update the ambulance's latest location
    await client.query(
      `UPDATE ambulances
       SET lat = $1, lng = $2, updated_at = NOW()
       WHERE id = $3`,
      [lat, lng, id]
    );

    // Store this GPS reading in the location history
    const result = await client.query(
      `INSERT INTO ambulance_locations (ambulance_id, lat, lng)
       VALUES ($1, $2, $3)
       RETURNING id, ambulance_id, lat, lng, recorded_at`,
      [id, lat, lng]
    );

    await client.query('COMMIT');

    const location = result.rows[0];

    return res.status(201).json({
      message: 'Ambulance location updated successfully.',
      data: {
        id: location.id,
        ambulanceId: location.ambulance_id,
        lat: location.lat,
        lng: location.lng,
        recordedAt: location.recorded_at,
      },
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Error updating ambulance location:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update ambulance location.',
      },
    });
  } finally {
    if (client) client.release();
  }
}

async function getAmbulanceLocationHistory(req, res) {
  const { id } = req.params;

  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
    100
  );

  try {
    const ambulance = await pool.query(
      'SELECT id FROM ambulances WHERE id = $1',
      [id]
    );

    if (ambulance.rowCount === 0) {
      return res.status(404).json({
        error: {
          code: 'AMBULANCE_NOT_FOUND',
          message: 'Ambulance not found.',
        },
      });
    }

    const result = await pool.query(
      `SELECT id, ambulance_id, lat, lng, recorded_at
       FROM ambulance_locations
       WHERE ambulance_id = $1
       ORDER BY recorded_at DESC, id DESC
       LIMIT $2`,
      [id, limit]
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      ambulanceId: row.ambulance_id,
      lat: row.lat,
      lng: row.lng,
      recordedAt: row.recorded_at,
    }));

    return res.status(200).json({
      data,
      count: data.length,
    });
  } catch (error) {
    console.error('Error fetching location history:', error.message);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch ambulance location history.',
      },
    });
  }
}


module.exports = {
  updateAmbulanceLocation,
  getAmbulanceLocationHistory,
};