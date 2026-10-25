
const express = require('express');
const {
  listAmbulances,
  getAmbulance,
  getNearbyAmbulances,
} = require('../controllers/ambulanceController');

const router = express.Router();

/**
 * @openapi
 * /api/ambulances:
 *   get:
 *     summary: List ambulances
 *     tags: [Ambulances]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [available, busy, offline]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [BLS, ALS, ICU, NEONATAL]
 *     responses:
 *       '200':
 *         description: Ambulance list
 *       '400':
 *         description: Invalid query parameter
 */

router.get('/nearby', getNearbyAmbulances);

router.get('/', listAmbulances);

/**
 * @openapi
 * /api/ambulances/{id}:
 *   get:
 *     summary: Get an ambulance by ID
 *     tags: [Ambulances]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Ambulance found
 *       '404':
 *         description: Ambulance not found
 */


router.get('/:id', getAmbulance);

module.exports = router;
