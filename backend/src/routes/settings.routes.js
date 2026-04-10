/**
 * @file backend/src/routes/settings.routes.js
 * @description Routes for user settings management.
 */

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { getSettings, updateSettings } = require('../controllers/settings.controller');

const router = Router();

router.use(verifyToken);

router.get('/', getSettings);
router.put('/', updateSettings);

module.exports = router;
