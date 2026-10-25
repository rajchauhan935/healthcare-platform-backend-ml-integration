
const express = require('express');
const {
  listHospitals,
  getHospital,
} = require('../controllers/hospitalController');

const router = express.Router();

/**
 * @openapi
 * /api/hospitals:
 *   get:
 *     summary: List hospitals
 *     tags: [Hospitals]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [cardiac, trauma, neuro, maternity, burns, general]
 *       - in: query
 *         name: pmjayEmpanelled
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: hasIcuBeds
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *     responses:
 *       '200':
 *         description: Paginated hospital list
 *       '400':
 *         description: Invalid query parameters
 */
router.get('/', listHospitals);

/**
 * @openapi
 * /api/hospitals/{id}:
 *   get:
 *     summary: Get a hospital by ID
 *     tags: [Hospitals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Hospital found
 *       '404':
 *         description: Hospital not found
 */
router.get('/:id', getHospital);

module.exports = router;
