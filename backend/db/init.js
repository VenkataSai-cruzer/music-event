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
        pdf_path      TEXT,
        qr_path       TEXT
      );
    `);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
    throw err;
  }
};

module.exports = { createTables };
