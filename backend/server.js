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

// ── Static Files ──
app.use('/qrcodes', express.static(path.join(__dirname, 'public', 'qrcodes')));
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
    error: err.message || 'Internal server error',
  });
});

// ── Ensure Chrome is installed for Puppeteer PDF generation ──
// Render's cached node_modules often skip postinstall, so we check at startup.
// Runs in the background so the server can start immediately (non-blocking).
const { exec } = require('child_process');
const fs = require('fs');

/**
 * Installs Chrome in the background if it's not already available.
 * Runs asynchronously after server start so it doesn't block.
 */
async function ensureChromeInstalled() {
  try {
    const puppeteer = require('puppeteer');
    const chromePath = await puppeteer.executablePath();
    if (chromePath && fs.existsSync(chromePath)) {
      return; // Already installed
    }
  } catch (_) {}

  console.log('⏳ Installing Chrome for Puppeteer (background)...');
  exec('npx --yes puppeteer browsers install chrome', {
    timeout: 300000,
  }, (err) => {
    if (err) {
      console.error('❌ Chrome install failed:', err.message);
      return;
    }
    console.log('✓ Chrome installed');
  });
}

/**
 * Ensures Chrome binary has execute permissions.
 * Blocks server startup until done (critical for fixing EACCES before first request).
 */
async function ensureChromePermissions() {
  try {
    const puppeteer = require('puppeteer');
    const chromePath = await puppeteer.executablePath();
    if (!chromePath || !fs.existsSync(chromePath)) {
      console.log('⚠ Chrome not installed yet — PDF generation will need background install');
      return;
    }
    // Check if executable — if not, fix it synchronously
    try {
      fs.accessSync(chromePath, fs.constants.X_OK);
      console.log('✓ Chrome ready');
    } catch (_) {
      console.log('⚠ Chrome not executable — fixing permissions...');
      fs.chmodSync(chromePath, 0o755);
      console.log('✓ Chrome permissions fixed');
    }
  } catch (e) {
    console.log('⚠ Could not verify Chrome:', e.message);
  }
}

// ── Initialize DB → Fix Chrome → Start Server ──
createTables()
  .then(async () => {
    // Fix Chrome permission BEFORE any requests arrive (synchronous after await)
    await ensureChromePermissions();
    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    // Install in background if Chrome is still missing
    ensureChromeInstalled();
  })
  .catch((err) => {
    console.error('Failed to initialize:', err);
    process.exit(1);
  });
