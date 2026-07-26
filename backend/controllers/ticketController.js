const ticketService = require('../services/ticketService');
const path = require('path');
const fs = require('fs');

/**
 * POST /api/tickets
 * Creates a new ticket with immediate PDF generation.
 */
async function createTicket(req, res, next) {
  try {
    const { name, gender, email, mobile } = req.body;
    const ticket = await ticketService.createTicket({ name, gender, email, mobile });
    return res.status(201).json({ message: 'Ticket created successfully', ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets
 * Returns all tickets with search and pagination.
 */
async function getAllTickets(req, res, next) {
  try {
    const { search, page, limit } = req.query;
    const result = await ticketService.getAllTickets({
      search,
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
 * GET /api/tickets/download/:ticketId
 * Streams the PDF file. Auto-regenerates if missing (ephemeral filesystem).
 */
async function downloadTicket(req, res, next) {
  try {
    const ticket = await ticketService.getTicketByTicketId(req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    let pdfPath = ticket.pdf_path
      ? path.join(__dirname, '..', 'public', ticket.pdf_path.replace(/^\//, ''))
      : null;

    if (!pdfPath || !fs.existsSync(pdfPath)) {
      try {
        const updatedTicket = await ticketService.regeneratePDF(ticket.ticket_id);
        pdfPath = updatedTicket.pdf_path
          ? path.join(__dirname, '..', 'public', updatedTicket.pdf_path.replace(/^\//, ''))
          : null;
      } catch (regErr) {
        return res.status(500).json({ error: 'Failed to regenerate PDF: ' + regErr.message });
      }
    }

    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return res.status(500).json({ error: 'Unable to generate PDF. Please try again.' });
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
 * Atomic verify + approve. Only returns VALID/USED/INVALID.
 */
async function verifyTicket(req, res, next) {
  try {
    const { qr_token } = req.body;
    if (!qr_token) return res.status(400).json({ error: 'qr_token is required' });

    let scannedBy = req.body.scanned_by;
    if (req.admin) {
      if (req.admin.role === 'scanner') scannedBy = req.admin.display_name || req.admin.username;
      else if (req.admin.role === 'admin') scannedBy = scannedBy || req.admin.username;
    }

    const { ticket, action } = await ticketService.verifyAndApprove(qr_token, scannedBy);

    if (!ticket) {
      return res.status(404).json({ valid: false, action: 'invalid', error: 'Invalid QR code' });
    }

    if (action === 'already_used') {
      return res.json({
        valid: false,
        action: 'already_used',
        ticket: {
          ticket_id: ticket.ticket_id,
          name: ticket.name,
          scanned_at: ticket.scanned_at,
          scanned_by: ticket.scanned_by,
        },
      });
    }

    // Entry approved
    return res.json({
      valid: true,
      action: 'approved',
      ticket: {
        ticket_id: ticket.ticket_id,
        name: ticket.name,
        scanned_at: ticket.scanned_at,
        scanned_by: ticket.scanned_by,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/tickets/use/:ticketId
 */
async function useTicket(req, res, next) {
  try {
    const ticket = await ticketService.useTicket(req.params.ticketId);
    return res.json({ message: 'Entry approved', ticket });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        error: err.message,
        ticket: err.ticket ? { ticket_id: err.ticket.ticket_id, name: err.ticket.name, status: err.ticket.status, scanned_at: err.ticket.scanned_at } : undefined,
      });
    }
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
}

/**
 * DELETE /api/tickets/:ticketId
 */
async function deleteTicket(req, res, next) {
  try {
    const ticket = await ticketService.deleteTicket(req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    return res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/scan-logs
 * Returns paginated scan logs (USED tickets with scan details).
 */
async function getScanLogs(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await ticketService.getScanLogs({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 30,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createTicket, getAllTickets, getDashboard, downloadTicket, verifyTicket, useTicket, deleteTicket, getScanLogs };
