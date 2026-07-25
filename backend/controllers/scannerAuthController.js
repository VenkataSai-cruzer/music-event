const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');

/**
 * POST /api/auth/scanner-login
 * Authenticates a scanner and returns a JWT with role: 'scanner'.
 */
async function scannerLogin(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM scanners WHERE username = $1 AND active = true',
      [username]
    );

    const scanner = result.rows[0];
    if (!scanner) {
      return res.status(401).json({ error: 'Invalid scanner credentials' });
    }

    const isValid = await bcrypt.compare(password, scanner.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid scanner credentials' });
    }

    const token = jwt.sign(
      {
        username: scanner.username,
        role: 'scanner',
        display_name: scanner.display_name,
        scanner_id: scanner.id,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      message: 'Scanner login successful',
      token,
      scanner: {
        username: scanner.username,
        display_name: scanner.display_name,
        id: scanner.id,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { scannerLogin };
