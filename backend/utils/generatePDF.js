const PDFDocument = require('pdfkit');
const path = require('path');

// ── Colors ──
const GOLD = '#D4A017';
const NEAR_BLACK = '#181818';
const SECONDARY = '#666666';
const PANEL_BG = '#F7F7F7';
const BORDER = '#E6E6E6';
const LIGHT = '#999999';

// ── Geometry ──
const PW = 595.28;
const PH = 841.89;
const MG = 45;
const CW = PW - MG * 2;
const CX = PW / 2;
const TY = 40;

// ── Font paths ──
const fontDir = path.join(__dirname, '..', 'node_modules', 'open-sans-fonts', 'open-sans');
const FONT_R = path.join(fontDir, 'Regular', 'OpenSans-Regular.ttf');
const FONT_SB = path.join(fontDir, 'SemiBold', 'OpenSans-SemiBold.ttf');
const FONT_B = path.join(fontDir, 'Bold', 'OpenSans-Bold.ttf');

const fs = require('fs');
const hasFont = fs.existsSync(FONT_R);

async function generatePDF(ticket, qrBuffer, eventSettings) {
  // Use dynamic event settings from database, fall back to defaults
  const ev = eventSettings || {};
  const eventName = ev.event_name || '7 NOTES \u2013 Live Jamming Session';
  const eventDate = ev.event_date || '08 August 2026, Saturday';
  const eventTime = ev.event_time || '5:30 PM \u2013 9:00 PM';
  const eventVenue = ev.venue || 'CAFOOZE';
  const eventAddress = ev.address || 'Plot No. 7, Engineers Enclave, Y Junction, VT Agraharam, Vizianagaram, Andhra Pradesh';
  return new Promise((resolve, reject) => {
    try {
      const now = new Date();
      const ds = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const ts = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

      // Reuse QR — already generated with UUID by the caller

      // ── Render ──
      const doc = new PDFDocument({
        size: 'A4', layout: 'portrait',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: { Title: `Admission - ${ticket.ticket_id}`, Author: 'Event System', Subject: 'Admission Confirmation' },
      });

      const bufs = [];
      doc.on('data', c => bufs.push(c));
      doc.on('end', () => resolve(Buffer.concat(bufs)));
      doc.on('error', reject);

      // ── Register fonts ──
      const F = { r: 'Helvetica', sb: 'Helvetica-Bold', b: 'Helvetica-Bold' };
      if (hasFont) {
        doc.registerFont('OSR', FONT_R);
        doc.registerFont('OSSB', FONT_SB);
        doc.registerFont('OSB', FONT_B);
        F.r = 'OSR'; F.sb = 'OSSB'; F.b = 'OSB';
      }

      // ── Helpers ──
      function card(y, h, isInfo) {
        doc.save();
        doc.roundedRect(MG, y, CW, h, 6);
        doc.fillColor(PANEL_BG).fill();
        doc.roundedRect(MG, y, CW, h, 6);
        doc.lineWidth(isInfo ? 0.8 : 0.5).strokeColor(isInfo ? GOLD : BORDER).stroke();
        doc.restore();
      }

      // ── HEADER ──
      let y = TY;

      // Ensure title fits on one line
      let titleSize = 20;
      doc.fontSize(titleSize).font(F.b);
      while (doc.widthOfString('EVENT REGISTRATION CONFIRMATION') > CW && titleSize > 14) {
        titleSize -= 0.5;
        doc.fontSize(titleSize);
      }
      doc.fillColor(NEAR_BLACK).text('EVENT REGISTRATION CONFIRMATION', MG, y);
      y += titleSize + 8;

      doc.fontSize(9).font(F.r).fillColor(SECONDARY)
        .text('Your registration has been confirmed. Present the QR code below at the venue entrance.', MG, y, { width: CW });
      y += 20;

      // ── MAIN CARD: Event Info + QR ──
      // Measure card content first
      const evFields = [
        { l: 'Event', v: eventName, big: true },
        { l: 'Date', v: eventDate },
        { l: 'Time', v: eventTime },
        { l: 'Venue', v: eventVenue },
        { l: 'Address', v: eventAddress },
      ];

      const leftW = CW * 0.58;
      const rightW = CW * 0.38;
      const qrSz = Math.min(rightW - 10, 145);
      const cardPad = 16;

      // Calculate left column height
      let lh = cardPad;
      evFields.forEach(f => {
        lh += 6; // gap before label
        if (f.big) { lh += 10; } // extra space for big value
        lh += 10; // label
        lh += 14; // value
      });
      lh += cardPad;

      // Calculate right column height
      let rh = cardPad + 12 + qrSz + 8 + 10 + 8 + 12 + cardPad;

      const cardH = Math.max(lh, rh) + cardPad;

      // Draw card
      card(y, cardH);
      const cardTop = y;

      // ── LEFT: EVENT DETAILS ──
      y = cardTop + cardPad;

      for (const f of evFields) {
        y += 4;
        doc.fontSize(7).font(F.sb).fillColor(SECONDARY).text(f.l.toUpperCase(), MG + cardPad, y);
        y += 9;
        const fs = f.big ? 14 : 10;
        const fw = f.big ? F.b : F.r;
        doc.fontSize(fs).font(fw).fillColor(NEAR_BLACK)
          .text(f.v, MG + cardPad, y, { width: leftW - cardPad });
        y += doc.heightOfString(f.v, { width: leftW - cardPad }) + 2;
      }

      // ── RIGHT: QR ──
      const qrX = MG + leftW + (rightW - qrSz) / 2;
      const qrY = cardTop + cardPad + 6;

      doc.fontSize(8).font(F.sb).fillColor(GOLD)
        .text('ENTRY QR', MG + leftW, qrY, { align: 'center', width: rightW });
      doc.image(qrBuffer, qrX, qrY + 12, { width: qrSz, height: qrSz });

      const qrCapY = qrY + 12 + qrSz + 6;
      doc.fontSize(7).font(F.r).fillColor(SECONDARY)
        .text('Scan once at the entrance', MG + leftW, qrCapY, { align: 'center', width: rightW });
      doc.fontSize(7).font(F.r).fillColor(SECONDARY)
        .text('Valid for one-time admission', MG + leftW, qrCapY + 10, { align: 'center', width: rightW });

      y = cardTop + cardH + 18;

      // ── ATTENDEE DETAILS ──
      doc.fontSize(12).font(F.b).fillColor(NEAR_BLACK).text('ATTENDEE DETAILS', MG, y);
      y += 18;

      const attRows = [
        [
          { l: 'Full Name', v: ticket.name || '' },
          { l: 'Gender', v: ticket.gender || '' },
        ],
        [
          { l: 'Email Address', v: ticket.email || '' },
          { l: 'Mobile Number', v: ticket.mobile || '' },
        ],
        [
          { l: 'Ticket ID', v: ticket.ticket_id || '' },
          { l: 'Registration Date', v: ds + ', ' + ts },
        ],
      ];

      const colW = CW / 2;

      for (const row of attRows) {
        let rowH = 0;
        for (let i = 0; i < row.length; i++) {
          const f = row[i];
          const x = MG + i * colW;
          doc.fontSize(7).font(F.sb).fillColor(SECONDARY).text(f.l.toUpperCase(), x, y);
          const vh = doc.heightOfString(f.v, { width: colW - 8 });
          doc.fontSize(10).font(F.r).fillColor(NEAR_BLACK)
            .text(f.v, x, y + 10, { width: colW - 8 });
          rowH = Math.max(rowH, 10 + Math.max(vh, 14));
        }
        y += rowH + 6;
      }

      y += 10;

      // ── ENTRY INFORMATION PANEL ──
      const entryRules = [
        'This confirmation is valid only for the registered attendee.',
        'The QR code is valid for one-time entry only.',
        'This confirmation is non-transferable.',
        'Entry may be refused in cases of QR misuse or fraudulent activity.',
        'Please arrive at least 30 minutes before the event.',
        'Outside food, prohibited substances, and dangerous items are not allowed.',
        'Follow all instructions given by venue staff and security personnel.',
        'Keep this PDF available until entry is completed.',
      ];

      // Measure panel height
      let pH = 14 + 16; // heading + gap
      doc.fontSize(8.5).font(F.r);
      for (const r of entryRules) {
        pH += doc.heightOfString(r, { width: CW - 32 }) + 4;
      }
      pH += 14;

      const panelTop = y;
      doc.save();
      doc.roundedRect(MG, panelTop, CW, pH, 6);
      doc.fillColor(PANEL_BG).fill();
      doc.roundedRect(MG, panelTop, CW, pH, 6);
      doc.lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.restore();

      y = panelTop + 14;
      doc.fontSize(11).font(F.b).fillColor(NEAR_BLACK).text('ENTRY INFORMATION', MG + 14, y);
      y += 18;

      doc.fontSize(8.5).font(F.r).fillColor(NEAR_BLACK);
      for (let i = 0; i < entryRules.length; i++) {
        const num = (i + 1) + '. ';
        const nw = doc.widthOfString(num);
        doc.text(num, MG + 14, y);
        doc.text(entryRules[i], MG + 14 + nw, y, { width: CW - 32 - nw });
        y += doc.heightOfString(entryRules[i], { width: CW - 32 - nw }) + 3;
      }

      y = panelTop + pH + 18;

      // ── FOOTER ──
      // Light border
      doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MG, y).lineTo(PW - MG, y).stroke();
      y += 10;

      const footCol = CW / 3;
      doc.fontSize(7.5).font(F.r).fillColor(LIGHT);

      doc.text('Ticket ID', MG, y);
      doc.font(F.sb).fillColor(NEAR_BLACK).text(ticket.ticket_id || '', MG, y + 10);

      doc.font(F.r).fillColor(LIGHT).text('Status', MG + footCol, y);
      doc.font(F.sb).fillColor(NEAR_BLACK).text(ticket.status || 'VALID', MG + footCol, y + 10);

      doc.font(F.r).fillColor(LIGHT).text('Generated', MG + footCol * 2, y);
      doc.font(F.sb).fillColor(NEAR_BLACK).text(ds + ', ' + ts, MG + footCol * 2, y + 10);

      y += 32;

      doc.fontSize(7).font(F.r).fillColor(LIGHT)
        .text('This document was generated electronically. No signature is required.', CX, y, { align: 'center' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = generatePDF;
