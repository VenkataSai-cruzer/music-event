-- Run this file against your PostgreSQL database to initialize the schema
-- psql -U postgres -d music_event -f db/schema.sql

CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY,
  attendee_name VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  event_name    VARCHAR(255)  NOT NULL,
  event_date    DATE          NOT NULL,
  venue         VARCHAR(255)  NOT NULL,
  seat_number   VARCHAR(50),
  qr_code_path  TEXT,
  pdf_path      TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
