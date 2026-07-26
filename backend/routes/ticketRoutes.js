const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const {
  createTicket, getAllTickets, getDashboard,
  downloadTicket, useTicket, deleteTicket,
} = require('../controllers/ticketController');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

// ── PROTECTED ROUTES ──
router.get('/dashboard', requireAuth, getDashboard);
router.post('/', requireAuth, createTicket);
router.get('/', requireAuth, getAllTickets);
router.put('/use/:ticketId', requireAuth, useTicket);
router.get('/download/:ticketId', requireAuth, downloadTicket);
router.delete('/:ticketId', requireAuth, deleteTicket);

module.exports = router;
