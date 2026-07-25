const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getSettings, updateSettings, uploadLogo, uploadAdditionalLogo } = require('../controllers/settingsController');
const { authenticateToken } = require('../middleware/auth');

// All settings routes require authentication
router.use(authenticateToken);

// Multer config for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'public', 'logos'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Use a key-prefixed filename to avoid collisions
    const key = req.body.logoKey || 'event-logo';
    cb(null, `${key}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.get('/', getSettings);
router.put('/', updateSettings);
router.post('/logo', upload.single('logo'), uploadLogo);

// Upload additional logos (partner, sponsor, etc.)
router.post('/logo/additional', upload.single('logo'), uploadAdditionalLogo);

module.exports = router;
