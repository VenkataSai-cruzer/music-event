const express = require('express');
const router = express.Router();
const {
  createTicket,
  getAllTickets,
  getDashboard,
  getTicketById,
  downloadTicket,
  previewTicket,
  verifyTicket,
  useTicket,
  deleteTicket,
  regeneratePDF,
  exportCsv,
  getScanHistory,
  getTicketTimeline,
  generateBadge,
  bulkImport,
  sendEmail,
} = require('../controllers/ticketController');
const { authenticateToken } = require('../middleware/auth');
const { createTicketValidation } = require('../middleware/validate');
const multer = require('multer');

// Ticket preview (HTML version identical to PDF - no auth required for preview)
router.get('/preview/:ticketId', previewTicket);

// All ticket routes require authentication
router.use(authenticateToken);

// Multer for CSV upload (memory storage)
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// CSV export (must be before /:id route)
router.get('/export/csv', exportCsv);

// Bulk import from CSV
router.post('/bulk-import', csvUpload.single('file'), bulkImport);

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

// Generate badge
router.post('/:ticketId/badge', generateBadge);

// Send email
router.post('/:ticketId/send-email', sendEmail);

// Timeline for a specific ticket (before /:id catch-all)
router.get('/:ticketId/timeline', getTicketTimeline);

// Regenerate PDF
router.post('/regenerate/:ticketId', regeneratePDF);

// Get single ticket
router.get('/:id', getTicketById);

// Delete ticket
router.delete('/:ticketId', deleteTicket);

module.exports = router;
