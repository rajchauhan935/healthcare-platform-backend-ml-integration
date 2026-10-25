require('./setup');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');

describe('base API and assigned summary/auth routes', () => {
  test('health has required keys', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.data).toEqual(expect.objectContaining({
      status: 'ok', time: expect.any(String), uptimeSeconds: expect.any(Number), version: expect.any(String)
    }));
  });

  test('unknown route returns standard JSON 404', async () => {
    const response = await request(app).get('/not-a-route').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  test('malformed JSON returns 400 VALIDATION_ERROR', async () => {
    const response = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{"email":')
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('login rejects unknown and wrong credentials with same response', async () => {
    const unknown = await request(app).post('/api/auth/login')
      .send({ email: 'unknown@demo.test', password: 'wrong' }).expect(401);
    const wrong = await request(app).post('/api/auth/login')
      .send({ email: 'patient@demo.test', password: 'wrong' }).expect(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('login returns token and safe profile for development demo user', async () => {
    const response = await request(app).post('/api/auth/login')
      .send({ email: 'patient@demo.test', password: 'DemoPatient#2026' }).expect(200);
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(response.body.data.user.role).toBe('patient');
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
  });

  test('session rejects missing and malformed tokens', async () => {
    await request(app).get('/api/session/me').expect(401);
    await request(app).get('/api/session/me').set('Authorization', 'Bearer bad-token').expect(401);
  });

  test('session rejects expired tokens', async () => {
    const token = jwt.sign({ sub: 'U-001', role: 'patient' }, process.env.JWT_SECRET, { expiresIn: -1 });
    await request(app).get('/api/session/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  test('home summary requires auth and returns expected contract', async () => {
    await request(app).get('/api/home/summary').expect(401);
    const token = jwt.sign({ sub: 'U-001', role: 'patient' }, process.env.JWT_SECRET);
    const response = await request(app).get('/api/home/summary').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Object.keys(response.body.data).sort()).toEqual([
      'emergencyContacts', 'nearbyAmbulanceCount', 'nearbyRadiusKm', 'quickServices'
    ]);
    expect(response.body.data.quickServices).toHaveLength(5);
  });

  test('patient is forbidden from dashboard summary', async () => {
    const token = jwt.sign({ sub: 'U-001', role: 'patient' }, process.env.JWT_SECRET);
    await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${token}`).expect(403);
  });

  test('ops dashboard response has exact fields and 24 hourly buckets', async () => {
    const token = jwt.sign({ sub: 'U-002', role: 'ops' }, process.env.JWT_SECRET);
    const response = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Object.keys(response.body.data).sort()).toEqual([
      'activeAmbulances', 'avgResponseMinutes', 'emergenciesByHour', 'emergencyCountToday',
      'generatedAt', 'hospitalsAvailable', 'priorityAlerts'
    ]);
    expect(response.body.data.emergenciesByHour).toHaveLength(24);
    expect(response.body.data.emergenciesByHour.map((item) => item.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  test('Swagger UI is available', async () => {
    await request(app).get('/api/docs/').expect(200);
  });
});
