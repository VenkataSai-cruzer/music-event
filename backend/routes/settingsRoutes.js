const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingsController');
const { authenticateToken } = require('../middleware/auth');

// All settings routes require authentication
router.use(authenticateToken);

router.get('/', getSettings);
router.put('/', updateSettings);

module.exports = router;
