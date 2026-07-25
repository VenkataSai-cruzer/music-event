const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db/db');
const { JWT_SECRET } = require('../middleware/auth');

// ── Inline admin auth (same pattern as ticketRoutes) ──
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * GET /api/scanners
 * List all scanner accounts (admin only).
 */
async function listScanners(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, username, display_name, active, created_at FROM scanners ORDER BY created_at ASC'
    );
    return res.json({ scanners: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/scanners
 * Create a new scanner account (admin only).
 */
async function createScanner(req, res, next) {
  try {
    const { username, password, display_name } = req.body;
    if (!username || !password || !display_name) {
      return res.status(400).json({ error: 'username, password, and display_name are required' });
    }

    const existing = await pool.query('SELECT id FROM scanners WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Scanner username already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      `INSERT INTO scanners (username, password_hash, display_name)
       VALUES ($1, $2, $3) RETURNING id, username, display_name, active, created_at`,
      [username, hash, display_name]
    );

    return res.status(201).json({ message: 'Scanner created', scanner: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/scanners/:id/status
 * Toggle scanner active/inactive (admin only).
 */
async function toggleScanner(req, res, next) {
  try {
    const { active } = req.body;
    if (active === undefined || active === null) {
      return res.status(400).json({ error: 'active (boolean) is required' });
    }
    const result = await pool.query(
      `UPDATE scanners SET active = $1 WHERE id = $2
       RETURNING id, username, display_name, active, created_at`,
      [active, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scanner not found' });
    }
    return res.json({ message: 'Scanner updated', scanner: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/scanners/:id
 * Delete a scanner account (admin only).
 */
async function deleteScanner(req, res, next) {
  try {
    const result = await pool.query(
      'DELETE FROM scanners WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scanner not found' });
    }
    return res.json({ message: 'Scanner deleted' });
  } catch (err) {
    next(err);
  }
}

router.get('/', requireAdmin, listScanners);
router.post('/', requireAdmin, createScanner);
router.put('/:id/status', requireAdmin, toggleScanner);
router.delete('/:id', requireAdmin, deleteScanner);

module.exports = router;
