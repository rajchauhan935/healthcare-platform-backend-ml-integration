
require('dotenv').config();

const pool = require('../src/config/db');

const ambulanceTypes = [
  'ICU', 'ICU', 'ICU', 'ICU',
  'ALS', 'ALS', 'ALS', 'ALS', 'ALS',
  'BLS', 'BLS', 'BLS', 'BLS', 'BLS',
  'NEONATAL',
];

const ambulanceStatuses = [
  'available', 'available', 'available', 'available',
  'available', 'available', 'available', 'available',
  'available', 'available',
  'busy', 'busy', 'busy', 'busy',
  'offline',
];

const hospitalCategories = [
  'cardiac', 'trauma', 'neuro', 'maternity', 'burns',
  'general', 'cardiac', 'trauma', 'neuro', 'maternity',
  'burns', 'general', 'cardiac', 'trauma', 'neuro',
  'maternity', 'burns', 'general', 'cardiac', 'general',
];

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert 15 demo ambulances.
    for (let i = 0; i < 15; i++) {
      const number = String(i + 1).padStart(3, '0');

      const id = `AMB-${number}`;
      const type = ambulanceTypes[i];
      const status = ambulanceStatuses[i];
      const lat = 26.70 + (i % 10) * 0.012;
      const lng = 83.30 + (i % 10) * 0.014;

      await client.query(
        `INSERT INTO ambulances
          (id, type, status, lat, lng, driver_name, registration_no)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type,
           status = EXCLUDED.status,
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           driver_name = EXCLUDED.driver_name,
           registration_no = EXCLUDED.registration_no,
           updated_at = NOW()`,
        [
          id,
          type,
          status,
          lat,
          lng,
          `Demo Driver ${number}`,
          `UP53AB${number}`,
        ]
      );
    }

    // Insert 20 demo hospitals.
    for (let i = 0; i < 20; i++) {
      const number = String(i + 1).padStart(3, '0');

      const id = `HOS-${number}`;
      const category = hospitalCategories[i];
      const lat = 26.70 + (i % 10) * 0.011;
      const lng = 83.30 + (i % 10) * 0.013;
      const icuBedsFree = i % 5 === 0 ? 0 : (i % 8) + 1;
      const ventilatorsFree = i % 4;
      const pmjayEmpanelled = i % 2 === 0;

      await client.query(
        `INSERT INTO hospitals
          (id, name, category, icu_beds_free, ventilators_free,
           pmjay_empanelled, lat, lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           icu_beds_free = EXCLUDED.icu_beds_free,
           ventilators_free = EXCLUDED.ventilators_free,
           pmjay_empanelled = EXCLUDED.pmjay_empanelled,
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           updated_at = NOW()`,
        [
          id,
          `Demo Hospital ${number}`,
          category,
          icuBedsFree,
          ventilatorsFree,
          pmjayEmpanelled,
          lat,
          lng,
        ]
      );
    }

    await client.query('COMMIT');
    console.log('Seed completed: 15 ambulances and 20 hospitals.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
