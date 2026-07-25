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
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security Middleware (applied to ALL routes including public ones) ──
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
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
app.get('/api/tickets/preview/:ticketId', (req, res, next) => {
  const ticketController = require('./controllers/ticketController');
  ticketController.previewTicket(req, res, next);
});
app.post('/api/auth/scanner-login', (req, res, next) => {
  const { scannerLogin } = require('./controllers/scannerAuthController');
  scannerLogin(req, res, next);
});

// ── Logging ──
app.use(morgan('dev'));

// ── Static Files ──
app.use('/qrcodes', express.static(path.join(__dirname, 'public', 'qrcodes')));
app.use('/tickets', express.static(path.join(__dirname, 'public', 'tickets')));
app.use('/logos', express.static(path.join(__dirname, 'public', 'logos')));

// ── Routes (with auth) ──
app.use('/api/auth', authRoutes); // POST /login, POST /scanner-login
app.use('/api/scanners', scannerRoutes);  // Admin CRUD for scanners
app.use('/api/tickets', ticketRoutes);
app.use('/api/settings', settingsRoutes);

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
    error: err.message || 'Internal server error',
  });
});

// ── Initialize DB & Start Server ──
createTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
