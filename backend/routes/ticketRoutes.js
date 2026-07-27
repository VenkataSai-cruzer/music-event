const express = require('express');
const router = express.Router();

const {
  createTicket, getAllTickets, getDashboard,
  downloadTicket, useTicket, deleteTicket, getScanLogs,
} = require('../controllers/ticketController');

const { requireAdmin } = require('../middleware/auth');

// ── PROTECTED ROUTES ──
router.get('/dashboard', requireAdmin, getDashboard);
router.get('/scan-logs', requireAdmin, getScanLogs);
router.post('/', requireAdmin, createTicket);
router.get('/', requireAdmin, getAllTickets);
router.put('/use/:ticketId', requireAdmin, useTicket);
router.get('/download/:ticketId', requireAdmin, downloadTicket);
router.delete('/:ticketId', requireAdmin, deleteTicket);

module.exports = router;
