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
} = require('../controllers/ticketController');
const { authenticateToken } = require('../middleware/auth');
const { createTicketValidation } = require('../middleware/validate');

// All ticket routes require authentication
router.use(authenticateToken);

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

// Regenerate PDF
router.post('/regenerate/:ticketId', regeneratePDF);

// Get single ticket
router.get('/:id', getTicketById);

// Delete ticket
router.delete('/:ticketId', deleteTicket);

module.exports = router;
