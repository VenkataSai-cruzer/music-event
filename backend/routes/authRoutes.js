const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const { scannerLogin } = require('../controllers/scannerAuthController');

// POST /api/auth/login (admin)
router.post('/login', login);

// POST /api/auth/scanner-login (scanner accounts)
router.post('/scanner-login', scannerLogin);

module.exports = router;
