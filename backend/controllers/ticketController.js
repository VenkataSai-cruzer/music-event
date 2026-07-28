const ticketService = require('../services/ticketService');
const pool = require('../db/db');

/**
 * POST /api/tickets
 * Creates a new registration with immediate PDF generation.
 */
async function createTicket(req, res, next) {
  try {
    const { name, gender, email, mobile } = req.body;

    // Server-side validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.', code: 'VALIDATION_ERROR' });
    }
    if (!gender) {
      return res.status(400).json({ success: false, message: 'Gender is required.', code: 'VALIDATION_ERROR' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required.', code: 'VALIDATION_ERROR' });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ success: false, message: 'Mobile number is required.', code: 'VALIDATION_ERROR' });
    }

    const ticket = await ticketService.createTicket({ name: name.trim(), gender, email: email.trim().toLowerCase(), mobile: mobile.trim() });
    return res.status(201).json({
      success: true,
      message: 'Registration created successfully.',
      data: {
        id: ticket.id,
        ticketId: ticket.ticket_id,
        status: ticket.status,
        attendee: {
          fullName: ticket.name,
          gender: ticket.gender,
          email: ticket.email,
          mobile: ticket.mobile,
        },
        createdAt: ticket.created_at,
        hasPdf: !!ticket.pdf_data,
        downloadUrl: `/api/tickets/download/${ticket.ticket_id}`,
        previewUrl: `/api/tickets/preview/${ticket.ticket_id}`,
      },
    });
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
    return res.json({ success: true, ...result });
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
    return res.json({ success: true, ...stats });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/download/:ticketId
 * Serves the PDF as attachment (download).
 */
async function downloadTicket(req, res, next) {
  try {
    const ticket = await ticketService.getTicketByTicketId(req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Registration not found.', code: 'NOT_FOUND' });

    // If pdf_data is null, regenerate the PDF
    if (!ticket.pdf_data) {
      try {
        const updatedTicket = await ticketService.regeneratePDF(ticket.ticket_id);
        if (!updatedTicket || !updatedTicket.pdf_data) {
          return res.status(500).json({ success: false, message: 'Unable to generate PDF. Please try again.', code: 'PDF_ERROR' });
        }
        ticket.pdf_data = updatedTicket.pdf_data;
      } catch (regErr) {
        return res.status(500).json({ success: false, message: 'Failed to regenerate PDF: ' + regErr.message, code: 'PDF_ERROR' });
      }
    }

    const filename = `registration-${ticket.ticket_id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', ticket.pdf_data.length);
    res.send(ticket.pdf_data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/preview/:ticketId
 * Serves the PDF inline (browser preview).
 */
async function previewTicket(req, res, next) {
  try {
    const ticket = await ticketService.getTicketByTicketId(req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Registration not found.', code: 'NOT_FOUND' });

    // If pdf_data is null, regenerate the PDF
    if (!ticket.pdf_data) {
      try {
        const updatedTicket = await ticketService.regeneratePDF(ticket.ticket_id);
        if (!updatedTicket || !updatedTicket.pdf_data) {
          return res.status(500).json({ success: false, message: 'Unable to generate PDF. Please try again.', code: 'PDF_ERROR' });
        }
        ticket.pdf_data = updatedTicket.pdf_data;
      } catch (regErr) {
        return res.status(500).json({ success: false, message: 'Failed to generate PDF: ' + regErr.message, code: 'PDF_ERROR' });
      }
    }

    const filename = `registration-${ticket.ticket_id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', ticket.pdf_data.length);
    res.send(ticket.pdf_data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tickets/:id/regenerate-pdf
 * Regenerates the PDF for an existing ticket without changing any data.
 */
async function regenerateTicketPDF(req, res, next) {
  try {
    const ticketId = req.params.ticketId;
    const updated = await ticketService.regeneratePDF(ticketId);
    return res.json({
      success: true,
      message: 'PDF regenerated successfully.',
      data: {
        ticketId: updated.ticket_id,
        downloadUrl: `/api/tickets/download/${updated.ticket_id}`,
        previewUrl: `/api/tickets/preview/${updated.ticket_id}`,
      },
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, message: err.message, code: 'NOT_FOUND' });
    }
    next(err);
  }
}

/**
 * POST /api/tickets/verify
 * Atomic verify + approve. Returns APPROVED/USED/CANCELLED/INVALID.
 */
async function verifyTicket(req, res, next) {
  try {
    const { qr_token } = req.body;
    if (!qr_token) {
      return res.status(400).json({ success: false, message: 'QR token is required.', code: 'VALIDATION_ERROR' });
    }

    let scannedBy = req.body.scanned_by;
    if (req.admin) {
      if (req.admin.role === 'scanner') scannedBy = req.admin.display_name || req.admin.username;
      else if (req.admin.role === 'admin') scannedBy = scannedBy || req.admin.username;
    }

    const { ticket, action } = await ticketService.verifyAndApprove(qr_token, scannedBy);

    if (action === 'invalid') {
      return res.status(404).json({
        success: false,
        result: 'INVALID',
        message: 'Registration not found.',
      });
    }

    if (action === 'cancelled') {
      return res.json({
        success: false,
        result: 'CANCELLED',
        action: 'cancelled',
        message: 'This registration has been cancelled.',
      });
    }

    if (action === 'already_used') {
      return res.json({
        success: false,
        result: 'ALREADY_USED',
        action: 'already_used',
        message: 'This registration has already been used.',
        data: {
          ticketId: ticket.ticket_id,
          attendeeName: ticket.name,
          scannedAt: ticket.scanned_at,
          scannedBy: ticket.scanned_by,
        },
      });
    }

    // Entry approved
    return res.json({
      success: true,
      result: 'APPROVED',
      action: 'approved',
      message: 'Entry approved.',
      data: {
        ticketId: ticket.ticket_id,
        attendeeName: ticket.name,
        status: ticket.status,
        scannedAt: ticket.scanned_at,
        scannedBy: ticket.scanned_by,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/tickets/:ticketId/cancel
 * Cancels a VALID registration.
 */
async function cancelTicket(req, res, next) {
  try {
    const ticketId = req.params.ticketId;
    const cancelledBy = req.admin?.username || 'admin';
    const ticket = await ticketService.cancelTicket(ticketId, cancelledBy);
    return res.json({
      success: true,
      message: 'Registration cancelled successfully.',
      data: {
        ticketId: ticket.ticket_id,
        status: ticket.status,
        cancelledAt: ticket.cancelled_at,
      },
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, message: err.message, code: 'NOT_FOUND' });
    }
    if (err.statusCode === 409) {
      return res.status(409).json({ success: false, message: err.message, code: 'CONFLICT' });
    }
    next(err);
  }
}

/**
 * PUT /api/tickets/use/:ticketId
 */
async function useTicket(req, res, next) {
  try {
    const ticket = await ticketService.useTicket(req.params.ticketId);
    return res.json({ success: true, message: 'Entry approved', data: { ticket } });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: err.message,
        code: 'CONFLICT',
        data: err.ticket ? { ticketId: err.ticket.ticket_id, name: err.ticket.name, status: err.ticket.status, scannedAt: err.ticket.scanned_at } : undefined,
      });
    }
    if (err.statusCode === 404) return res.status(404).json({ success: false, message: err.message, code: 'NOT_FOUND' });
    next(err);
  }
}

/**
 * DELETE /api/tickets/:ticketId
 */
async function deleteTicket(req, res, next) {
  try {
    const ticket = await ticketService.deleteTicket(req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Registration not found.', code: 'NOT_FOUND' });
    return res.json({ success: true, message: 'Registration deleted successfully.' });
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
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/export/csv
 * Exports all registrations as a CSV file.
 */
async function exportCSV(req, res, next) {
  try {
    const csvData = await ticketService.exportCSV();
    const filename = `registrations-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/event-settings
 * Returns current event settings.
 */
async function getEventSettings(req, res, next) {
  try {
    const settings = await ticketService.getEventSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/tickets/event-settings
 * Updates event settings.
 */
async function updateEventSettings(req, res, next) {
  try {
    const { event_name, event_date, event_time, venue, address } = req.body;
    await pool.query(
      `UPDATE event_settings SET
        event_name = COALESCE($1, event_name),
        event_date = COALESCE($2, event_date),
        event_time = COALESCE($3, event_time),
        venue = COALESCE($4, venue),
        address = COALESCE($5, address),
        updated_at = NOW()
       WHERE id = 1`,
      [event_name || null, event_date || null, event_time || null, venue || null, address || null]
    );
    const updated = await ticketService.getEventSettings();
    return res.json({ success: true, message: 'Event settings updated.', data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { createTicket, getAllTickets, getDashboard, downloadTicket, previewTicket, regenerateTicketPDF, verifyTicket, cancelTicket, useTicket, deleteTicket, getScanLogs, exportCSV, getEventSettings, updateEventSettings };
