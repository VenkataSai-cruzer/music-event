const ticketService = require('../services/ticketService');
const path = require('path');
const fs = require('fs');

/**
 * POST /api/tickets
 * Creates a new ticket with duplicate detection.
 */
async function createTicket(req, res, next) {
  try {
    const { name, gender, email, mobile } = req.body;

    // Duplicate check
    if (email || mobile) {
      const existing = await ticketService.findDuplicate(email, mobile);
      if (existing && !req.body.force) {
        return res.status(409).json({
          error: 'A ticket with this email or mobile already exists.',
          duplicate: existing,
        });
      }
    }

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
 * GET /api/tickets/preview/:ticketId
 * Returns the HTML ticket preview (identical to what the PDF will look like).
 * Uses the shared renderTicketHTML from generatePuppeteerPDF to avoid code duplication.
 */
async function previewTicket(req, res, next) {
  try {
    const ticket = await ticketService.getTicketByTicketId(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const settings = await ticketService.getEventSettings();
    const logoAbsolutePath = settings?.event_logo
      ? path.join(__dirname, '..', 'public', settings.event_logo.replace(/^\//, ''))
      : null;

    const qrAbsolutePath = ticket.qr_path
      ? path.join(__dirname, '..', 'public', ticket.qr_path.replace(/^\//, ''))
      : null;

    // Use the shared template renderer from the PDF generator
    const { renderTicketHTML } = require('../utils/generatePuppeteerPDF');
    const html = renderTicketHTML(ticket, qrAbsolutePath, logoAbsolutePath);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
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
 * If the PDF file doesn't exist (e.g., after Render restart), auto-regenerates it.
 * ticketId is the ME-2026-000001 format.
 */
async function downloadTicket(req, res, next) {
  try {
    const ticket = await ticketService.getTicketByTicketId(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    let pdfPath = ticket.pdf_path
      ? path.join(__dirname, '..', 'public', ticket.pdf_path.replace(/^\//, ''))
      : null;

    // Auto-regenerate if file is missing (handles Render's ephemeral filesystem)
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

    // Log download activity
    ticketService.logActivity(ticket.ticket_id, 'downloaded').catch(() => {});

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ticket.ticket_id}.pdf"`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tickets/verify
 * Atomic verify + approve endpoint.
 * If ticket is VALID, atomically updates to USED with scanned_by and scanned_at.
 * Scanner accounts log in separately via /api/auth/scanner-login.
 * If called from admin (no scanner context), scanned_by can be passed in body.
 */
async function verifyTicket(req, res, next) {
  try {
    const { qr_token } = req.body;
    if (!qr_token) {
      return res.status(400).json({ error: 'qr_token is required' });
    }

    // Determine scanned_by from:
    // 1. Scanner JWT token (role: scanner)
    // 2. Or body.scanned_by (free-text for simple setups)
    // 3. Or admin username from admin JWT
    let scannedBy = req.body.scanned_by;
    if (req.admin) {
      if (req.admin.role === 'scanner') {
        scannedBy = req.admin.display_name || req.admin.username;
      } else if (req.admin.role === 'admin') {
        scannedBy = scannedBy || req.admin.username;
      }
    }

    const { ticket, action } = await ticketService.verifyAndApprove(qr_token, scannedBy);

    if (!ticket) {
      return res.status(404).json({
        valid: false,
        action: 'invalid',
        error: 'Invalid ticket',
      });
    }

    if (action === 'already_used') {
      return res.json({
        valid: false,
        action: 'already_used',
        ticket: {
          ticket_id: ticket.ticket_id,
          name: ticket.name,
          status: ticket.status,
          event_date: ticket.event_date,
          event_address: ticket.event_address,
          scanned_at: ticket.scanned_at,
          scanned_by: ticket.scanned_by,
        },
      });
    }

    if (action === 'cancelled') {
      return res.json({
        valid: false,
        action: 'cancelled',
        ticket: {
          ticket_id: ticket.ticket_id,
          name: ticket.name,
          status: ticket.status,
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
        status: ticket.status,
        event_date: ticket.event_date,
        event_address: ticket.event_address,
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

/**
 * GET /api/tickets/export/csv
 * Exports all tickets as CSV for offline backup.
 */
async function exportCsv(req, res, next) {
  try {
    const result = await ticketService.getAllTickets({ limit: 100000 });
    const tickets = result.tickets;

    const headers = [
      'Ticket ID', 'Name', 'Gender', 'Email', 'Mobile',
      'Event Date', 'Event Address', 'Status',
      'Created At', 'Scanned At', 'QR Token',
    ];

    const rows = tickets.map((t) => [
      t.ticket_id,
      `"${(t.name || '').replace(/"/g, '""')}"`,
      t.gender,
      t.email,
      t.mobile,
      t.event_date,
      `"${(t.event_address || '').replace(/"/g, '""')}"`,
      t.status,
      t.created_at,
      t.scanned_at || '',
      t.qr_token,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tickets.csv"');
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/scan-history
 * Returns paginated scan history.
 */
async function getScanHistory(req, res, next) {
  try {
    const { page } = req.query;
    const result = await ticketService.getScanHistory({
      page: parseInt(page, 10) || 1,
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/:ticketId/timeline
 * Returns activity timeline for a ticket.
 */
async function getTicketTimeline(req, res, next) {
  try {
    const timeline = await ticketService.getTicketTimeline(req.params.ticketId);
    return res.json(timeline);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tickets/:ticketId/badge
 * Generates a printable badge PDF.
 */
async function generateBadge(req, res, next) {
  try {
    const ticket = await ticketService.getTicketByTicketId(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const settings = await ticketService.getEventSettings();
    const logoAbsolutePath = settings?.event_logo
      ? path.join(__dirname, '..', 'public', settings.event_logo.replace(/^\//, ''))
      : null;

    const generateBadgePDF = require('../utils/generateBadge');
    const badgePath = await generateBadgePDF(ticket, ticket.qr_path, logoAbsolutePath);

    const badgeAbsolutePath = path.join(__dirname, '..', 'public', badgePath.replace(/^\//, ''));
    if (!fs.existsSync(badgeAbsolutePath)) {
      return res.status(404).json({ error: 'Badge file not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="badge-${ticket.ticket_id}.pdf"`);
    fs.createReadStream(badgeAbsolutePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tickets/bulk-import
 * Imports tickets from CSV file upload.
 */
async function bulkImport(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { parse } = require('csv-parse/sync');
    const records = parse(req.file.buffer.toString(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (!records || records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has no valid rows' });
    }

    if (records.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 tickets per import' });
    }

    const results = { success: 0, failed: 0, errors: [] };

    for (const row of records) {
      try {
        const name = row.name || row.Name || row.NAME;
        const gender = row.gender || row.Gender || row.GENDER || 'Other';
        const email = row.email || row.Email || row.EMAIL;
        const mobile = row.mobile || row.Mobile || row.MOBILE || '';

        if (!name || !email) {
          results.failed++;
          results.errors.push({ row: row, error: 'Name and email are required' });
          continue;
        }

        await ticketService.createTicket({
          name,
          gender: ['Male', 'Female', 'Other'].includes(gender) ? gender : 'Other',
          email,
          mobile: String(mobile || ''),
        });

        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ row: row, error: err.message });
      }
    }

    return res.json({
      message: `Import complete: ${results.success} created, ${results.failed} failed`,
      results,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tickets/:ticketId/send-email
 * Sends the ticket PDF to the attendee's email.
 */
async function sendEmail(req, res, next) {
  try {
    const ticket = await ticketService.getTicketByTicketId(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const pdfPath = ticket.pdf_path
      ? path.join(__dirname, '..', 'public', ticket.pdf_path.replace(/^\//, ''))
      : null;

    // Auto-regenerate if file is missing (handles Render's ephemeral filesystem)
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

    const { sendTicketEmail } = require('../utils/sendEmail');
    const result = await sendTicketEmail(ticket.email, ticket, pdfPath);

    if (result.success) {
      return res.json({ message: result.message });
    } else {
      return res.status(400).json({ error: result.message });
    }
  } catch (err) {
    next(err);
  }
}

module.exports = {
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
};
