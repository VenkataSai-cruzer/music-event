const express = require('express');
const router = express.Router();
const {
  createTicket,
  getAllTickets,
  getTicketById,
  downloadTicket,
  deleteTicket,
} = require('../controllers/ticketController');

// Create a new ticket
router.post('/', createTicket);

// Get all tickets
router.get('/', getAllTickets);

// Get a single ticket by ID
router.get('/:id', getTicketById);

// Download the PDF for a ticket
router.get('/:id/download', downloadTicket);

// Delete a ticket
router.delete('/:id', deleteTicket);

module.exports = router;
