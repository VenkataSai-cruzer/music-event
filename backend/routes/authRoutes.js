const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const { loginValidation } = require('../middleware/validate');

// POST /api/auth/login
router.post('/login', loginValidation, login);

module.exports = router;
