const ticketService = require('../services/ticketService');
const path = require('path');
const fs = require('fs');

/**
 * POST /api/tickets
 * Creates a new ticket.
 */
async function createTicket(req, res, next) {
  try {
    const ticket = await ticketService.createTicket(req.body);
    return res.status(201).json({ message: 'Ticket created successfully', ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets
 * Returns all tickets with search, filter, pagination.
 */
async function getAllTickets(req, res, next) {
  try {
    const { search, status, page, limit } = req.query;
    const result = await ticketService.getAllTickets({
      search,
      status,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/dashboard
 * Returns dashboard statistics.
 */
async function getDashboard(req, res, next) {
  try {
    const stats = await ticketService.getDashboardStats();
    return res.json(stats);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/:id
 * Returns a single ticket by database ID.
 */
async function getTicketById(req, res, next) {
  try {
    const ticket = await ticketService.getTicketById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.json(ticket);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/download/:ticketId
 * Streams the PDF file for download.
 * ticketId is the ME-2026-000001 format.
 */
async function downloadTicket(req, res, next) {
  try {
    const ticket = await ticketService.getTicketByTicketId(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const pdfPath = ticket.pdf_path
      ? path.join(__dirname, '..', 'public', ticket.pdf_path.replace(/^\//, ''))
      : null;

    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'PDF file not found. Try regenerating.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ticket.ticket_id}.pdf"`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tickets/verify
 * Verifies a QR token (UUID) and returns ticket info.
 */
async function verifyTicket(req, res, next) {
  try {
    const { qr_token } = req.body;
    if (!qr_token) {
      return res.status(400).json({ error: 'qr_token is required' });
    }

    const ticket = await ticketService.verifyTicketByQrToken(qr_token);
    if (!ticket) {
      return res.status(404).json({ error: 'Invalid ticket', valid: false });
    }

    return res.json({
      valid: true,
      ticket: {
        ticket_id: ticket.ticket_id,
        name: ticket.name,
        status: ticket.status,
        event_date: ticket.event_date,
        event_address: ticket.event_address,
        scanned_at: ticket.scanned_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/tickets/use/:ticketId
 * Marks a ticket as USED (entry approved).
 */
async function useTicket(req, res, next) {
  try {
    const ticket = await ticketService.useTicket(req.params.ticketId);
    return res.json({ message: 'Entry approved', ticket });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        error: err.message,
        ticket: err.ticket ? {
          ticket_id: err.ticket.ticket_id,
          name: err.ticket.name,
          status: err.ticket.status,
          scanned_at: err.ticket.scanned_at,
        } : undefined,
      });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * DELETE /api/tickets/:ticketId
 * Deletes a ticket by ticket_id (ME-2026-XXXXXX).
 */
async function deleteTicket(req, res, next) {
  try {
    const ticket = await ticketService.deleteTicket(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tickets/regenerate/:ticketId
 * Regenerates the PDF for an existing ticket.
 */
async function regeneratePDF(req, res, next) {
  try {
    const ticket = await ticketService.regeneratePDF(req.params.ticketId);
    return res.json({ message: 'PDF regenerated successfully', ticket });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = {
  createTicket,
  getAllTickets,
  getDashboard,
  getTicketById,
  downloadTicket,
  verifyTicket,
  useTicket,
  deleteTicket,
  regeneratePDF,
};
