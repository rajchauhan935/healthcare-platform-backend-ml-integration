const request = require('supertest');
const app = require('../src/app');

describe('Backend health endpoint', () => {
    test('GET / returns a successful health response', async () => {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
            'Emergency Healthcare Backend is running'
        );
    });
});
