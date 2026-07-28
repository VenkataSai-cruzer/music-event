const express = require('express');
const router = express.Router();

const {
  createTicket, getAllTickets, getDashboard,
  downloadTicket, previewTicket, regenerateTicketPDF,
  cancelTicket, useTicket, deleteTicket, getScanLogs,
} = require('../controllers/ticketController');

const { requireAdmin } = require('../middleware/auth');

// ── PROTECTED ROUTES (admin only) ──
router.get('/dashboard', requireAdmin, getDashboard);
router.get('/scan-logs', requireAdmin, getScanLogs);
router.post('/', requireAdmin, createTicket);
router.get('/', requireAdmin, getAllTickets);
router.put('/use/:ticketId', requireAdmin, useTicket);
router.get('/download/:ticketId', requireAdmin, downloadTicket);
router.get('/preview/:ticketId', requireAdmin, previewTicket);
router.post('/:ticketId/regenerate-pdf', requireAdmin, regenerateTicketPDF);
router.patch('/:ticketId/cancel', requireAdmin, cancelTicket);
router.delete('/:ticketId', requireAdmin, deleteTicket);

module.exports = router;
