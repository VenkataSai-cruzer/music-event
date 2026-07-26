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

    // ── Migration: drop old columns from previous schema ──
    // The old tickets table had event_date, event_address, qr_path columns with NOT NULL
    // which conflict with the simplified single-event schema.
    // These are idempotent — safe to run every startup.
    try {
      await pool.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS event_date;`);
      await pool.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS event_address;`);
      await pool.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS qr_path;`);
      await pool.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS updated_at;`);
      // Drop old CHECK constraint that included CANCELLED if it exists
      // First, convert any CANCELLED tickets so the new constraint doesn't fail
      await pool.query(`UPDATE tickets SET status = 'USED' WHERE status = 'CANCELLED';`);
      await pool.query(`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;`);
      await pool.query(`ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('VALID', 'USED'));`);
      console.log('Migration: old columns cleaned up');
    } catch (migrateErr) {
      // Non-fatal — table might not have old columns
      console.log('Migration note:', migrateErr.message);
    }

    // Drop unused tables from old schema
    await pool.query(`DROP TABLE IF EXISTS activity_log;`);
    await pool.query(`DROP TABLE IF EXISTS event_settings;`);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
    throw err;
  }
};

module.exports = { createTables };
