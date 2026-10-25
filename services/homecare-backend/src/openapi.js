module.exports = {
  openapi: '3.0.3',
  info: { title: 'Emergency & Home Healthcare API', version: '1.0.0', description: 'Phase 1 backend APIs' },
  servers: [{ url: 'http://localhost:4000' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } } } } }
    }
  },
  paths: {
    '/api/health': { get: { summary: 'Health and optional database status', responses: { '200': { description: 'Service health' } } } },
    '/api/auth/login': { post: { summary: 'Login with email and password', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } } }, responses: { '200': { description: 'JWT and safe user profile' }, '401': { description: 'INVALID_CREDENTIALS' } } } },
    '/api/session/me': { get: { summary: 'Current authenticated user', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Safe user fields' }, '401': { description: 'Unauthorized' } } } },
    '/api/home/summary': { get: { summary: 'Patient home summary', security: [{ bearerAuth: [] }], parameters: [{ in: 'query', name: 'lat', schema: { type: 'number' } }, { in: 'query', name: 'lng', schema: { type: 'number' } }], responses: { '200': { description: 'Home summary' }, '403': { description: 'Forbidden' } } } },
    '/api/dashboard/summary': { get: { summary: 'Operations dashboard summary', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Dashboard summary with 24 hourly buckets' }, '403': { description: 'Forbidden' }, '503': { description: 'Sample provider unavailable' } } } }
  }
};
