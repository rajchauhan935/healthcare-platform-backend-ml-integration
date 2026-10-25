const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const { loadEnv } = require('./config/env');
const requestId = require('./middleware/requestId');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const openapi = require('./openapi');

const env = loadEnv();
const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS']
}));
app.use(requestId);
morgan.token('request-id', (req) => req.id);
app.use(morgan(':method :url :status :response-time ms request-id=:request-id', {
  skip: () => env.NODE_ENV === 'test'
}));
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiLimiter);

app.get('/', (_req, res) => res.json({ data: { name: 'Emergency & Home Healthcare API', docs: '/api/docs', health: '/api/health' } }));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/session', require('./routes/session'));
app.use('/api/home', require('./routes/home'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
