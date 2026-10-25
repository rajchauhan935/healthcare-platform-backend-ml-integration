
const pool = require('../config/db');
const { mapToCamelCase } = require('../utils/mapper');

const {
  haversineDistanceKm,
  recommendAmbulance,
  estimateEta,
} = require('../services/aiClient');

const EMERGENCY_TYPES = [
  'cardiac', 'trauma', 'stroke', 'maternity',
  'breathing', 'burns', 'general',
];

const EMERGENCY_CONFIG = {
  cardiac:   { ambulanceType: 'ICU', hospitalCategory: 'cardiac' },
  trauma:    { ambulanceType: 'ALS', hospitalCategory: 'trauma' },
  stroke:    { ambulanceType: 'ALS', hospitalCategory: 'neuro' },
  maternity: { ambulanceType: 'NEONATAL', hospitalCategory: 'maternity' },
  breathing: { ambulanceType: 'ALS', hospitalCategory: 'general' },
  burns:     { ambulanceType: 'ALS', hospitalCategory: 'burns' },
  general:   { ambulanceType: 'BLS', hospitalCategory: 'general' },
};


function sendError(res, status, code, message) {
  return res.status(status).json({
    error: { code, message },
  });
}


async function loadCandidates(lat, lng, hospitalCategory) {
  const ambulancesResult = await pool.query(
    `SELECT * FROM (
      SELECT id, type, lat, lng,
        6371 * 2 * ASIN(SQRT(LEAST(1,
          POWER(SIN(RADIANS(lat - $1) / 2), 2) +
          COS(RADIANS($1)) * COS(RADIANS(lat)) *
          POWER(SIN(RADIANS(lng - $2) / 2), 2)
        ))) AS "distanceKm"
      FROM ambulances
      WHERE status = 'available'
        AND lat IS NOT NULL AND lng IS NOT NULL
    ) candidates
    WHERE "distanceKm" <= 10
    ORDER BY "distanceKm" ASC`,
    [lat, lng]
  );

  const hospitalsResult = await pool.query(
    `SELECT id, category, icu_beds_free AS "icuBedsFree",
       pmjay_empanelled AS "pmjayEmpanelled", lat, lng
     FROM hospitals
     WHERE category = $1
       AND icu_beds_free > 0
       AND lat IS NOT NULL AND lng IS NOT NULL
     ORDER BY
       (POWER(lat - $2, 2) + POWER(lng - $3, 2)) ASC`,
    [hospitalCategory, lat, lng]
  );

  return {
    ambulances: ambulancesResult.rows,
    hospitals: hospitalsResult.rows,
  };
}


function withTimeout(promise, timeoutMs, message) {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => {
      clearTimeout(timer);
    });
}


async function createBooking(req, res) {
  const {
    emergencyType,
    pickupLat,
    pickupLng,
    ambulanceId,
    hospitalId,
    patientId,
  } = req.body || {};

  if (!EMERGENCY_TYPES.includes(emergencyType)) {
    return sendError(
      res, 400, 'VALIDATION_ERROR', 'Invalid emergencyType'
    );
  }

  const lat = Number(pickupLat);
  const lng = Number(pickupLng);

  if (
    pickupLat === undefined || pickupLat === '' ||
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    pickupLng === undefined || pickupLng === '' ||
    !Number.isFinite(lng) || lng < -180 || lng > 180
  ) {
    return sendError(
      res, 400, 'VALIDATION_ERROR', 'Invalid pickup coordinates'
    );
  }

  const effectivePatientId =
    ['ops', 'admin'].includes(req.user.role)
      ? (patientId || req.user.id)
      : req.user.id;

  let booking;

  // Phase 1: Create and commit the booking independently of AI.
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const patient = await client.query(
      'SELECT id FROM users WHERE id = $1',
      [effectivePatientId]
    );

    if (patient.rowCount === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'NOT_FOUND', 'Patient not found');
    }

    if (ambulanceId) {
      const ambulance = await client.query(
        'SELECT id, status FROM ambulances WHERE id = $1 FOR UPDATE',
        [ambulanceId]
      );

      if (ambulance.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'NOT_FOUND', 'Ambulance not found');
      }

      if (ambulance.rows[0].status !== 'available') {
        await client.query('ROLLBACK');
        return sendError(
          res, 409, 'CONFLICT', 'Ambulance is not available'
        );
      }
    }

    if (hospitalId) {
      const hospital = await client.query(
        'SELECT id FROM hospitals WHERE id = $1',
        [hospitalId]
      );

      if (hospital.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'NOT_FOUND', 'Hospital not found');
      }
    }

    const inserted = await client.query(
      `INSERT INTO bookings
        (patient_id, emergency_type, pickup_lat, pickup_lng,
         ambulance_id, hospital_id, status, ai_status,
         recommendation_reason)
       VALUES ($1, $2, $3, $4, $5, $6, 'requested', 'pending', NULL)
       RETURNING *`,
      [
        effectivePatientId,
        emergencyType,
        lat,
        lng,
        ambulanceId || null,
        hospitalId || null,
      ]
    );

    booking = inserted.rows[0];

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Booking rollback failed:', rollbackError.message);
    }

    if (
      error.code === '23505' &&
      error.constraint === 'idx_one_active_booking_per_patient'
    ) {
      return sendError(
        res, 409, 'ACTIVE_BOOKING_EXISTS',
        'Patient already has an active booking'
      );
    }

    console.error('Create booking failed:', error.message);
    return sendError(
      res, 500, 'INTERNAL_ERROR', 'Internal server error'
    );
  } finally {
    client.release();
  }

  // Phase 2: AI enrichment. Failure must not lose the booking.
  const bookingId = booking.id;
  const config = EMERGENCY_CONFIG[emergencyType];
  const deadline = Date.now() + 4000;

  const fallbackUpdate = async (reason, selectedAmbulance = null,
    selectedHospital = null, etaMinutes = null) => {
    console.warn(`[BE-10] Booking ${bookingId}: ${reason}`);

    const result = await pool.query(
      `UPDATE bookings
       SET ambulance_id = COALESCE($1, ambulance_id),
           hospital_id = COALESCE($2, hospital_id),
           eta_minutes = COALESCE($3, eta_minutes),
           ai_status = 'fallback',
           recommendation_reason = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        selectedAmbulance,
        selectedHospital,
        etaMinutes,
        reason,
        bookingId,
      ]
    );

    return result.rows[0];
  };

  try {
    const { ambulances, hospitals } = await loadCandidates(
      lat, lng, config.hospitalCategory
    );

    // Do not overwrite explicit assignments supplied in the request.
    let selectedAmbulance = ambulanceId
      ? ambulances.find(a => a.id === ambulanceId)
      : null;

    let selectedHospital = hospitalId
      ? hospitals.find(h => h.id === hospitalId)
      : null;

    if (!selectedAmbulance && ambulanceId) {
      const check = await pool.query(
        `SELECT id, type, lat, lng, status,
           6371 * 2 * ASIN(SQRT(LEAST(1,
             POWER(SIN(RADIANS(lat - $1) / 2), 2) +
             COS(RADIANS($1)) * COS(RADIANS(lat)) *
             POWER(SIN(RADIANS(lng - $2) / 2), 2)
           ))) AS "distanceKm"
         FROM ambulances WHERE id = $3 AND status = 'available'`,
        [lat, lng, ambulanceId]
      );

      selectedAmbulance = check.rows[0] || null;
    }

    if (!selectedHospital && hospitalId) {
      const check = await pool.query(
        `SELECT id, category, icu_beds_free AS "icuBedsFree",
           pmjay_empanelled AS "pmjayEmpanelled", lat, lng
         FROM hospitals WHERE id = $1`,
        [hospitalId]
      );

      selectedHospital = check.rows[0] || null;
    }

    if (!selectedAmbulance) {
      const payload = {
        emergencyType,
        patientLat: lat,
        patientLng: lng,
        ambulances: ambulances.map(a => ({
          id: a.id,
          type: a.type,
          lat: a.lat,
          lng: a.lng,
        })),
        hospitals: hospitals.map(h => ({
          id: h.id,
          category: h.category,
          icuBedsFree: h.icuBedsFree,
          pmjayEmpanelled: h.pmjayEmpanelled,
          lat: h.lat,
          lng: h.lng,
        })),
      };

      if (Date.now() >= deadline) {
        throw new Error('Booking enrichment budget exceeded');
      }

      const remaining = deadline - Date.now();
      const recommendation = await withTimeout(
        recommendAmbulance(payload, ambulances),
        remaining,
        'Booking enrichment budget exceeded'
      );


      selectedAmbulance = ambulances.find(
        a => a.id === recommendation.ambulanceId
      );

      if (!selectedAmbulance) {
        throw new Error('Recommended ambulance is not a candidate');
      }

      if (!selectedHospital && recommendation.topHospitals.length) {
        selectedHospital = hospitals.find(
          h => h.id === recommendation.topHospitals[0] &&
            h.category === recommendation.hospitalCategory
        ) || null;
      }

      if (!selectedHospital) {
        selectedHospital = hospitals[0] || null;
      }
    }

    // Recheck availability while holding a row lock before assignment.
    const assignmentClient = await pool.connect();

    try {
      await assignmentClient.query('BEGIN');

      const current = await assignmentClient.query(
        'SELECT id, status FROM ambulances WHERE id = $1 FOR UPDATE',
        [selectedAmbulance.id]
      );

      if (
        current.rowCount === 0 ||
        current.rows[0].status !== 'available'
      ) {
        await assignmentClient.query('ROLLBACK');

        const nearest = ambulances.find(
          a => a.id !== selectedAmbulance.id
        );

        selectedAmbulance = nearest || null;
      } else {
        await assignmentClient.query('COMMIT');
      }
    } finally {
      assignmentClient.release();
    }

    if (!selectedAmbulance) {
      booking = await fallbackUpdate(
        'No available ambulance could be assigned'
      );
    } else {
      let etaMinutes = null;
      let aiStatus = 'ok';
      let reason = 'AI recommendation completed';

      try {
        const istHour = Number(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            hourCycle: 'h23',
          }).format(new Date())
        );

        const etaPayload = {
          fromLat: selectedAmbulance.lat,
          fromLng: selectedAmbulance.lng,
          toLat: lat,
          toLng: lng,
          hour: istHour,
          ambulanceType: selectedAmbulance.type,
        };

        if (Date.now() >= deadline) {
          throw new Error('Booking enrichment budget exceeded');
        }
        const eta = await withTimeout(
          estimateEta(
            etaPayload,
            { lat: selectedAmbulance.lat, lng: selectedAmbulance.lng },
            { lat, lng }
          ),
          deadline - Date.now(),
          'Booking enrichment budget exceeded'
        );


        etaMinutes = Math.ceil(eta.etaMinutes);
      } catch (error) {
        etaMinutes = Math.ceil(
          haversineDistanceKm(
            selectedAmbulance.lat, selectedAmbulance.lng, lat, lng
          ) / 30 * 60
        );

        aiStatus = 'fallback';
        reason = `ETA fallback: ${error.message}`;
        console.warn(`[BE-10] Booking ${bookingId}: ${reason}`);
      }

      const updated = await pool.query(
        `UPDATE bookings
         SET ambulance_id = COALESCE($1, ambulance_id),
             hospital_id = COALESCE($2, hospital_id),
             eta_minutes = $3,
             ai_status = $4,
             recommendation_reason = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          selectedAmbulance.id,
          selectedHospital?.id || null,
          etaMinutes,
          aiStatus,
          reason,
          bookingId,
        ]
      );

      booking = updated.rows[0];
    }
  } catch (error) {
    try {
      const { ambulances, hospitals } = await loadCandidates(
        lat, lng, config.hospitalCategory
      );

      const selectedAmbulance =
        ambulances.find(a => a.type === config.ambulanceType) ||
        ambulances[0] ||
        null;

      const selectedHospital = hospitals[0] || null;

      let etaMinutes = null;

      if (selectedAmbulance) {
        etaMinutes = Math.ceil(
          haversineDistanceKm(
            selectedAmbulance.lat, selectedAmbulance.lng, lat, lng
          ) / 30 * 60
        );
      }

      booking = await fallbackUpdate(
        selectedAmbulance
          ? `AI recommendation fallback: ${error.message}`
          : 'No available ambulance found within 10 km',
        selectedAmbulance?.id || null,
        selectedHospital?.id || null,
        etaMinutes
      );
    } catch (fallbackError) {
      console.warn(
        `[BE-10] Booking ${bookingId}: fallback update failed: ${fallbackError.message}`
      );

      const latest = await pool.query(
        'SELECT * FROM bookings WHERE id = $1',
        [bookingId]
      );

      booking = latest.rows[0] || booking;
    }
  }

  return res.status(201).json({
    data: mapToCamelCase(booking),
  });
}

async function getBooking(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM bookings WHERE id = $1',
      [req.params.id]
    );

    const booking = result.rows[0];

    // Return 404 for both nonexistent bookings and another
    // patient's booking to avoid revealing its existence.
    if (
      !booking ||
      (
        req.user.role === 'patient' &&
        booking.patient_id !== req.user.id
      )
    ) {
      return sendError(res, 404, 'NOT_FOUND', 'Booking not found');
    }

    return res.status(200).json({
      data: mapToCamelCase(booking),
    });
  } catch (error) {
    console.error('Get booking failed:', error.message);
    return sendError(
      res, 500, 'INTERNAL_ERROR', 'Internal server error'
    );
  }
}

async function listBookings(req, res) {
  try {
    const { status, limit = '50', offset = '0' } = req.query;

    const allowedStatuses = [
      'requested', 'dispatched', 'picked_up',
      'arriving', 'completed', 'cancelled',
    ];

    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);

    if (
      status && !allowedStatuses.includes(status)
    ) {
      return sendError(
        res, 400, 'VALIDATION_ERROR', 'Invalid booking status'
      );
    }

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 || parsedLimit > 100 ||
      !Number.isInteger(parsedOffset) || parsedOffset < 0
    ) {
      return sendError(
        res, 400, 'VALIDATION_ERROR', 'Invalid pagination parameters'
      );
    }

    const conditions = [];
    const params = [];

    if (req.user.role === 'patient') {
      params.push(req.user.id);
      conditions.push(`patient_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM bookings ${where}`,
      params
    );

    const dataParams = [...params, parsedLimit, parsedOffset];

    const result = await pool.query(
      `SELECT * FROM bookings
       ${where}
       ORDER BY created_at DESC
       LIMIT $${dataParams.length - 1}
       OFFSET $${dataParams.length}`,
      dataParams
    );

    return res.status(200).json({
      data: mapToCamelCase(result.rows),
      count: countResult.rows[0].total,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  } catch (error) {
    console.error('List bookings failed:', error.message);
    return sendError(
      res, 500, 'INTERNAL_ERROR', 'Internal server error'
    );
  }
}


const ALLOWED_TRANSITIONS = {
  requested: ['dispatched', 'cancelled'],
  dispatched: ['picked_up', 'cancelled'],
  picked_up: ['arriving'],
  arriving: ['completed'],
  completed: [],
  cancelled: [],
};

async function updateBookingStatus(req, res) {
  const { status, etaMinutes } = req.body || {};

  if (!Object.hasOwn(ALLOWED_TRANSITIONS, status)) {
    return sendError(
      res, 400, 'VALIDATION_ERROR', 'Invalid booking status'
    );
  }

  if (
    etaMinutes !== undefined &&
    (
      !Number.isInteger(etaMinutes) ||
      etaMinutes < 0 ||
      etaMinutes > 600
    )
  ) {
    return sendError(
      res, 400, 'VALIDATION_ERROR',
      'etaMinutes must be an integer between 0 and 600'
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    const booking = result.rows[0];

    if (
      !booking ||
      (
        req.user.role === 'patient' &&
        booking.patient_id !== req.user.id
      )
    ) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'NOT_FOUND', 'Booking not found');
    }

    if (
      req.user.role === 'patient' &&
      status !== 'cancelled'
    ) {
      await client.query('ROLLBACK');
      return sendError(
        res, 403, 'FORBIDDEN',
        'Patients may only cancel their own bookings'
      );
    }

    if (!ALLOWED_TRANSITIONS[booking.status].includes(status)) {
      await client.query('ROLLBACK');
      return sendError(
        res, 409, 'INVALID_TRANSITION',
        `Cannot transition from ${booking.status} to ${status}`
      );
    }

    if (status === 'dispatched') {
      if (!booking.ambulance_id) {
        await client.query('ROLLBACK');
        return sendError(
          res, 409, 'CONFLICT',
          'An ambulance must be assigned before dispatch'
        );
      }

      const ambulanceResult = await client.query(
        'SELECT id, status FROM ambulances WHERE id = $1 FOR UPDATE',
        [booking.ambulance_id]
      );

      const ambulance = ambulanceResult.rows[0];

      if (!ambulance || ambulance.status !== 'available') {
        await client.query('ROLLBACK');
        return sendError(
          res, 409, 'CONFLICT',
          'Assigned ambulance is not available'
        );
      }

      await client.query(
        `UPDATE ambulances
         SET status = 'busy', updated_at = NOW()
         WHERE id = $1`,
        [booking.ambulance_id]
      );
    }

    if (
      ['completed', 'cancelled'].includes(status) &&
      booking.ambulance_id
    ) {
      await client.query(
        `UPDATE ambulances
         SET status = 'available', updated_at = NOW()
         WHERE id = $1 AND status = 'busy'`,
        [booking.ambulance_id]
      );
    }

    const updated = await client.query(
      `UPDATE bookings
       SET status = $1,
           eta_minutes = COALESCE($2, eta_minutes),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, etaMinutes ?? null, booking.id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      data: mapToCamelCase(updated.rows[0]),
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Booking rollback failed:', rollbackError.message);
    }

    console.error('Update booking status failed:', error.message);
    return sendError(
      res, 500, 'INTERNAL_ERROR', 'Internal server error'
    );
  } finally {
    client.release();
  }
}


module.exports = {
  createBooking,
  getBooking,
  listBookings,
  updateBookingStatus,
};
