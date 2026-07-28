require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createTables } = require('./db/init');

const authRoutes = require('./routes/authRoutes');
const scannerRoutes = require('./routes/scannerRoutes');
const ticketRoutes = require('./routes/ticketRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Trust proxy (before rate limiter — Render sits behind a proxy) ──
app.set('trust proxy', 1);

// ── Security Middleware (applied to ALL routes including public ones) ──
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate Limiting ──
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Auth-specific stricter limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later.' },
});
app.use('/api/auth/', authLimiter);

// ── Body Parsing ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── PUBLIC ENDPOINTS (no auth, but covered by helmet/cors/rate-limiter above) ──
app.post('/api/tickets/verify', (req, res, next) => {
  const ticketController = require('./controllers/ticketController');
  ticketController.verifyTicket(req, res, next);
});
// Public scanner stats endpoint (no auth — used by scanner for entry counts)
app.get('/api/scanner/stats', async (req, res, next) => {
  try {
    const pool = require('./db/db');
    const total = await pool.query('SELECT COUNT(*) FROM tickets');
    const used = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'USED'");
    const totalCount = parseInt(total.rows[0].count, 10);
    const usedCount = parseInt(used.rows[0].count, 10);
    res.json({ total: totalCount, used: usedCount, remaining: totalCount - usedCount });
  } catch (err) {
    next(err);
  }
});

// ── Logging ──
app.use(morgan('dev'));

// ── Static Files (ticket PDFs only — QR codes are generated in-memory) ──
app.use('/tickets', express.static(path.join(__dirname, 'public', 'tickets')));

// ── Routes (with auth) ──
app.use('/api/auth', authRoutes); // POST /login, POST /scanner-login
app.use('/api/scanners', scannerRoutes);  // Admin CRUD for scanners
app.use('/api/tickets', ticketRoutes);

// ── Health Check ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'An unexpected error occurred. Please try again.',
    code: err.code || 'INTERNAL_ERROR',
  });
});

// ── Initialize DB → Start Server ──
createTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize:', err);
    process.exit(1);
  });
