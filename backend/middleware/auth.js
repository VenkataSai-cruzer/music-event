const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

/**
 * Middleware to verify JWT token from Authorization header.
 * Attaches decoded admin info to req.admin.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Middleware that verifies JWT AND requires admin role.
 * Wraps authenticateToken with a role check.
 */
function requireAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.admin.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  });
}

module.exports = { authenticateToken, requireAdmin, JWT_SECRET };
