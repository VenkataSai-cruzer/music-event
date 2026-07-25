const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/**
 * POST /api/auth/login
 * Authenticates the single admin user and returns a JWT.
 */
async function login(req, res) {
  const { username, password } = req.body;

  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Compare password (using bcrypt if it looks like a hash, direct compare otherwise)
  const isPasswordValid = ADMIN_PASSWORD.startsWith('$2a$') || ADMIN_PASSWORD.startsWith('$2b$')
    ? await bcrypt.compare(password, ADMIN_PASSWORD)
    : password === ADMIN_PASSWORD;

  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { username: ADMIN_USERNAME, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    message: 'Login successful',
    token,
    admin: { username: ADMIN_USERNAME },
  });
}

module.exports = { login };
