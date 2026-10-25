
exports.up = (pgm) => {
  pgm.sql(`
    CREATE SEQUENCE bookings_id_seq START 1;

    CREATE TABLE users (
      id VARCHAR(20) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL
        CHECK (role IN ('patient', 'ops', 'admin')),
      phone VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE ambulances (
      id VARCHAR(20) PRIMARY KEY,
      type VARCHAR(20) NOT NULL
        CHECK (type IN ('BLS', 'ALS', 'ICU', 'NEONATAL')),
      status VARCHAR(20) NOT NULL
        CHECK (status IN ('available', 'busy', 'offline')),
      lat DOUBLE PRECISION NOT NULL
        CHECK (lat BETWEEN -90 AND 90),
      lng DOUBLE PRECISION NOT NULL
        CHECK (lng BETWEEN -180 AND 180),
      driver_name VARCHAR(150) NOT NULL,
      registration_no VARCHAR(30) NOT NULL UNIQUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE hospitals (
      id VARCHAR(20) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      category VARCHAR(30) NOT NULL
        CHECK (category IN (
          'cardiac', 'trauma', 'neuro',
          'maternity', 'burns', 'general'
        )),
      icu_beds_free INTEGER NOT NULL DEFAULT 0
        CHECK (icu_beds_free >= 0),
      ventilators_free INTEGER NOT NULL DEFAULT 0
        CHECK (ventilators_free >= 0),
      pmjay_empanelled BOOLEAN NOT NULL DEFAULT FALSE,
      lat DOUBLE PRECISION NOT NULL
        CHECK (lat BETWEEN -90 AND 90),
      lng DOUBLE PRECISION NOT NULL
        CHECK (lng BETWEEN -180 AND 180),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE bookings (
      id VARCHAR(20) PRIMARY KEY DEFAULT (
        'BK-' || LPAD(NEXTVAL('bookings_id_seq')::TEXT, 4, '0')
      ),
      patient_id VARCHAR(20) NOT NULL
        REFERENCES users(id),
      emergency_type VARCHAR(20) NOT NULL
        CHECK (emergency_type IN (
          'cardiac', 'trauma', 'stroke', 'maternity',
          'breathing', 'burns', 'general'
        )),
      pickup_lat DOUBLE PRECISION NOT NULL
        CHECK (pickup_lat BETWEEN -90 AND 90),
      pickup_lng DOUBLE PRECISION NOT NULL
        CHECK (pickup_lng BETWEEN -180 AND 180),
      ambulance_id VARCHAR(20)
        REFERENCES ambulances(id),
      hospital_id VARCHAR(20)
        REFERENCES hospitals(id),
      status VARCHAR(20) NOT NULL DEFAULT 'requested'
        CHECK (status IN (
          'requested', 'dispatched', 'picked_up',
          'arriving', 'completed', 'cancelled'
        )),
      eta_minutes INTEGER
        CHECK (eta_minutes BETWEEN 0 AND 600),
      ai_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (ai_status IN ('pending', 'ok', 'fallback')),
      recommendation_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE ambulance_locations (
      id BIGSERIAL PRIMARY KEY,
      ambulance_id VARCHAR(20) NOT NULL
        REFERENCES ambulances(id) ON DELETE CASCADE,
      lat DOUBLE PRECISION NOT NULL
        CHECK (lat BETWEEN -90 AND 90),
      lng DOUBLE PRECISION NOT NULL
        CHECK (lng BETWEEN -180 AND 180),
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_ambulances_status
      ON ambulances(status);

    CREATE INDEX idx_ambulances_coordinates
      ON ambulances(lat, lng);

    CREATE INDEX idx_hospitals_category
      ON hospitals(category);

    CREATE INDEX idx_bookings_patient
      ON bookings(patient_id);

    CREATE INDEX idx_bookings_status
      ON bookings(status);

    CREATE INDEX idx_bookings_created
      ON bookings(created_at);

    CREATE INDEX idx_ambulance_locations_recent
      ON ambulance_locations(ambulance_id, recorded_at DESC);

    CREATE UNIQUE INDEX idx_one_active_booking_per_patient
      ON bookings(patient_id)
      WHERE status NOT IN ('completed', 'cancelled');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS ambulance_locations;
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS hospitals;
    DROP TABLE IF EXISTS ambulances;
    DROP TABLE IF EXISTS users;
    DROP SEQUENCE IF EXISTS bookings_id_seq;
  `);
};
