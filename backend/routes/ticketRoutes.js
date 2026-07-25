const express = require('express');
const router = express.Router();
const {
  createTicket,
  getAllTickets,
  getDashboard,
  getTicketById,
  downloadTicket,
  verifyTicket,
  useTicket,
  deleteTicket,
  regeneratePDF,
  exportCsv,
  getScanHistory,
  getTicketTimeline,
} = require('../controllers/ticketController');
const { authenticateToken } = require('../middleware/auth');
const { createTicketValidation } = require('../middleware/validate');

// All ticket routes require authentication
router.use(authenticateToken);

// CSV export (must be before /:id route)
router.get('/export/csv', exportCsv);

// Scan history
router.get('/scan-history', getScanHistory);

// Dashboard stats
router.get('/dashboard', getDashboard);

// Create a new ticket
router.post('/', createTicketValidation, createTicket);

// Get all tickets (with search, filter, pagination)
router.get('/', getAllTickets);

// Verify QR token (POST)
router.post('/verify', verifyTicket);

// Use/approve a ticket
router.put('/use/:ticketId', useTicket);

// Download PDF
router.get('/download/:ticketId', downloadTicket);

// Timeline for a specific ticket (before /:id catch-all)
router.get('/:ticketId/timeline', getTicketTimeline);

// Regenerate PDF
router.post('/regenerate/:ticketId', regeneratePDF);

// Get single ticket
router.get('/:id', getTicketById);

// Delete ticket
router.delete('/:ticketId', deleteTicket);

module.exports = router;
