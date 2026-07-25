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
        event_date    DATE          NOT NULL,
        event_address TEXT          NOT NULL,
        status        VARCHAR(20)   NOT NULL DEFAULT 'VALID'
                      CHECK (status IN ('VALID', 'USED', 'CANCELLED')),
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        scanned_at    TIMESTAMPTZ,
        scanned_by    VARCHAR(100),
        pdf_path      TEXT,
        qr_path       TEXT
      );
    `);

    // Scanners table for gate/volunteer authentication
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

    // Seed default scanner accounts if table is empty
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

    // Event settings table (singleton row, id=1)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_settings (
        id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        event_name      VARCHAR(255) NOT NULL DEFAULT 'Music Event',
        event_logo      TEXT,
        event_date      DATE,
        event_time      VARCHAR(50),
        venue_name      VARCHAR(255),
        venue_address   TEXT,
        organizer_name  VARCHAR(255),
        contact_number  VARCHAR(20),
        support_email   VARCHAR(255),
        last_login_at   TIMESTAMPTZ,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        additional_logos      JSONB DEFAULT '{}'::jsonb,
        website               VARCHAR(255),
        instagram             VARCHAR(255),
        emergency_contact     VARCHAR(20),
        event_tagline         VARCHAR(255)
      );
    `);

    // Insert default settings row if not exists
    await pool.query(`
      INSERT INTO event_settings (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Activity log for ticket timeline tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id          SERIAL PRIMARY KEY,
        ticket_id   VARCHAR(50) NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
        event       VARCHAR(50) NOT NULL,
        metadata    JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Index for fast lookup
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_log_ticket_id ON activity_log(ticket_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
    `);

    // ── Migrations for existing tables ──
    // Add scanned_by column if not exists (tables may have been created before this migration)
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'scanned_by'
        ) THEN
          ALTER TABLE tickets ADD COLUMN scanned_by VARCHAR(100);
        END IF;
      END $$;
    `);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
    throw err;
  }
};

module.exports = { createTables };
