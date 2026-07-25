const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Controller imports ──
const {
  createTicket, getAllTickets, getDashboard, getTicketById,
  downloadTicket, useTicket,
  deleteTicket, regeneratePDF, exportCsv, getScanHistory,
  getTicketTimeline, generateBadge, bulkImport, sendEmail,
} = require('../controllers/ticketController');
const { createTicketValidation } = require('../middleware/validate');

// ── Inline auth middleware (avoids module import side effects) ──
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

// ── PROTECTED ROUTES (require auth) ──
// Note: verify and preview are handled in server.js (app-level) to avoid Express 5 router ordering issues
router.get('/export/csv', requireAuth, exportCsv);
router.post('/bulk-import', requireAuth, csvUpload.single('file'), bulkImport);
router.get('/scan-history', requireAuth, getScanHistory);
router.get('/dashboard', requireAuth, getDashboard);
router.post('/', requireAuth, createTicketValidation, createTicket);
router.get('/', requireAuth, getAllTickets);
router.put('/use/:ticketId', requireAuth, useTicket);
router.get('/download/:ticketId', requireAuth, downloadTicket);
router.post('/:ticketId/badge', requireAuth, generateBadge);
router.post('/:ticketId/send-email', requireAuth, sendEmail);
router.get('/:ticketId/timeline', requireAuth, getTicketTimeline);
router.post('/regenerate/:ticketId', requireAuth, regeneratePDF);
router.get('/:id', requireAuth, getTicketById);
router.delete('/:ticketId', requireAuth, deleteTicket);

module.exports = router;
