const ambulanceRoutes = require('./routes/ambulanceRoutes');
const hospitalRoutes = require('./routes/hospitalRoutes');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const authRoutes = require('./routes/authRoutes');

const locationRoutes = require('./routes/locationRoutes');

require('dotenv').config();


const express = require('express');
const cors = require('cors');
const pool = require('./config/db');

const bookingRoutes = require('./routes/bookingRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/ambulances', locationRoutes);

app.use('/api/ambulances', ambulanceRoutes);
app.use('/api/hospitals', hospitalRoutes);

app.use('/api/auth', authRoutes);

app.use('/api/bookings', bookingRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      status: 'ok',
      database: 'connected',
    });
  } catch (error) {
    console.error('Database health check failed:', error.message);

    res.status(500).json({
      status: 'error',
      database: 'disconnected',
    });
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
