const pool = require('./db');

const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id            SERIAL PRIMARY KEY,
        ticket_id     VARCHAR(50)   UNIQUE NOT NULL,
        qr_token      UUID          UNIQUE NOT NULL,
        name          VARCHAR(255)  NOT NULL,
        gender        VARCHAR(50)   NOT NULL,
        email         VARCHAR(255)  NOT NULL,
        mobile        VARCHAR(20)   NOT NULL,
        status        VARCHAR(20)   NOT NULL DEFAULT 'VALID'
                      CHECK (status IN ('VALID', 'USED')),
        scanned_by    VARCHAR(100),
        scanned_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        pdf_path      TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS scanners (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(50)   UNIQUE NOT NULL,
        password_hash VARCHAR(255)  NOT NULL,
        display_name  VARCHAR(100)  NOT NULL,
        active        BOOLEAN       NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);

    // Seed default scanner accounts
    const scannerCount = await pool.query('SELECT COUNT(*) FROM scanners');
    if (parseInt(scannerCount.rows[0].count, 10) === 0) {
      const bcrypt = require('bcryptjs');
      const hash = bcrypt.hashSync('scan123', 10);
      await pool.query(`
        INSERT INTO scanners (username, password_hash, display_name) VALUES
        ($1, $2, 'Gate A - Main Entrance'),
        ($3, $4, 'Gate B - Side Entrance'),
        ($5, $6, 'VIP Entrance')
      `, ['gate_a', hash, 'gate_b', hash, 'vip', hash]);
      console.log('Seeded 3 default scanner accounts (gate_a, gate_b, vip / password: scan123)');
    }

    // ── Add client_request_id column for idempotency ──
    const criCol = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tickets' AND column_name = 'client_request_id'
    `);
    if (criCol.rows.length === 0) {
      await pool.query(`ALTER TABLE tickets ADD COLUMN client_request_id UUID UNIQUE;`);
      console.log('Migration: added client_request_id column');
    }

    // ── Create event_settings table ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_settings (
        id            SERIAL PRIMARY KEY,
        event_name    VARCHAR(255) NOT NULL DEFAULT '7 NOTES \u2013 Live Jamming Session',
        event_date    VARCHAR(100) NOT NULL DEFAULT '08 August 2026, Saturday',
        event_time    VARCHAR(100) NOT NULL DEFAULT '5:30 PM \u2013 9:00 PM',
        venue         VARCHAR(255) NOT NULL DEFAULT 'CAFOOZE',
        address       TEXT NOT NULL DEFAULT 'Plot No. 7, Engineers Enclave, Y Junction, VT Agraharam, Vizianagaram, Andhra Pradesh',
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed default event settings if empty
    const settingsCount = await pool.query('SELECT COUNT(*) FROM event_settings');
    if (parseInt(settingsCount.rows[0].count, 10) === 0) {
      await pool.query(`INSERT INTO event_settings (event_name, event_date, event_time, venue, address) VALUES (DEFAULT, DEFAULT, DEFAULT, DEFAULT, DEFAULT);`);
      console.log('Seeded default event settings');
    }

    // ── Create activity_log table ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id            SERIAL PRIMARY KEY,
        action        VARCHAR(100) NOT NULL,
        description   TEXT,
        ticket_id     VARCHAR(50),
        performed_by  VARCHAR(100),
        result        VARCHAR(50),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);`);

    // ── Migration: clean up old schema and stale data ──
    try {
      // Phase 1: Drop old columns from previous schema if they still exist
      const colCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'event_date'
      `);
      if (colCheck.rows.length > 0) {
        await pool.query(`ALTER TABLE tickets DROP COLUMN event_date;`);
        await pool.query(`ALTER TABLE tickets DROP COLUMN event_address;`);
        await pool.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS qr_path;`);
        await pool.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS updated_at;`);
        await pool.query(`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;`);
        await pool.query(`ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('VALID', 'USED'));`);
        console.log('Migration: old columns cleaned up');
      }

      // Phase 2b: Add pdf_data BYTEA column for in-database PDF storage
      const pdfDataCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'pdf_data'
      `);
      if (pdfDataCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE tickets ADD COLUMN pdf_data BYTEA;`);
        console.log('Migration: added pdf_data BYTEA column');
      }

      // Phase 2: Clear old ticket data — only if BOTH old-style activity_log AND the old
      // event_settings structures exist from the PREVIOUS schema (pre-PDFKit era).
      // Check for a column that existed ONLY in the old activity_log, not our new one.
      const oldActivityLog = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'activity_log' AND column_name = 'action_details'
      `);
      const oldEventSettings = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'event_settings' AND column_name = 'last_login_at'
      `);
      if (oldActivityLog.rows.length > 0 || oldEventSettings.rows.length > 0) {
        const countRes = await pool.query('SELECT COUNT(*) FROM tickets');
        if (parseInt(countRes.rows[0].count, 10) > 0) {
          await pool.query(`DELETE FROM tickets;`);
          console.log('Migration: cleared ' + countRes.rows[0].count + ' stale ticket(s) from old schema');
        }
      }
    } catch (migrateErr) {
      console.log('Migration note:', migrateErr.message);
    }

    // ── Phase 3: Add CANCELLED status, timestamps, and indexes ──
    try {
      // Add CANCELLED to status check constraint
      await pool.query(`
        ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
      `);
      await pool.query(`
        ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
        CHECK (status IN ('VALID', 'USED', 'CANCELLED'));
      `);

      // Add cancelled_at column
      const cancelledAtCol = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'cancelled_at'
      `);
      if (cancelledAtCol.rows.length === 0) {
        await pool.query(`ALTER TABLE tickets ADD COLUMN cancelled_at TIMESTAMPTZ;`);
      }

      // Add updated_at column
      const updatedAtCol = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'updated_at'
      `);
      if (updatedAtCol.rows.length === 0) {
        await pool.query(`ALTER TABLE tickets ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();`);
      }

      // Add indexes for performance
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_uuid ON tickets (qr_token);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON tickets (ticket_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_scanned_at ON tickets (scanned_at);`);

      // Create ticket_id sequence for concurrent-safe ID generation
      await pool.query(`CREATE SEQUENCE IF NOT EXISTS ticket_id_seq START 1;`);

      // Sync sequence to max existing ticket ID to avoid collisions
      const seqSync = await pool.query(`
        SELECT COALESCE(MAX(CAST(SPLIT_PART(ticket_id, '-', 3) AS INTEGER)), 0) + 1 AS next_val
        FROM tickets
      `);
      const nextVal = parseInt(seqSync.rows[0].next_val, 10) || 1;
      await pool.query(`ALTER SEQUENCE ticket_id_seq RESTART WITH ${nextVal};`);

      console.log('Migration: added CANCELLED status, timestamps, and indexes');
    } catch (migrateErr) {
      console.log('Migration note (Phase 3):', migrateErr.message);
    }

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
    throw err;
  }
};

module.exports = { createTables };
