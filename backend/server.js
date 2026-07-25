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

// ── Ensure Chrome is installed for Puppeteer PDF generation ──
// Render's cached node_modules often skip postinstall, so we check at startup.
// Runs in the background so the server can start immediately (non-blocking).
const { exec } = require('child_process');
const fs = require('fs');

/**
 * Ensures the Chrome binary is executable (fixes common EACCES issue on Render).
 */
function fixChromePermissions(chromePath) {
  try {
    if (chromePath && fs.existsSync(chromePath)) {
      // Check if it's executable — if not, fix it
      try {
        fs.accessSync(chromePath, fs.constants.X_OK);
      } catch (_) {
        console.log('⚠ Chrome binary not executable — fixing permissions...');
        fs.chmodSync(chromePath, 0o755);
        console.log('✓ Chrome permissions fixed');
      }
    }
  } catch (e) {
    console.error('Failed to fix Chrome permissions:', e.message);
  }
}

async function ensureChromeInstalled() {
  let chromePath = null;
  try {
    const puppeteer = require('puppeteer');
    // executablePath() is async in Puppeteer v25+ — must await
    chromePath = await puppeteer.executablePath();
    if (chromePath && fs.existsSync(chromePath)) {
      fixChromePermissions(chromePath);
      console.log('✓ Chrome ready at', chromePath);
      return;
    }
    console.log('⚠ Chrome binary missing at', chromePath);
  } catch (e) {
    console.log('⚠ Chrome not available:', e.message);
  }

  // Install Chrome in the background (doesn't block server startup)
  console.log('⏳ Installing Chrome for Puppeteer (background)...');
  exec('npx --yes puppeteer browsers install chrome', {
    timeout: 300000, // 5 minutes
  }, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Chrome install failed:', err.message);
      console.log('PDF generation will be unavailable. Restart the service to retry.');
      return;
    }
    console.log('✓ Chrome installed successfully');
    // Fix permissions after install (common EACCES issue on Render)
    try {
      const puppeteer = require('puppeteer');
      puppeteer.executablePath().then(p => fixChromePermissions(p)).catch(() => {});
    } catch (_) {}
  });
}

// ── Initialize DB & Start Server ──
createTables()
  .then(() => {
    // Start server immediately (non-blocking)
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    // Install Chrome in background so the server is available right away
    ensureChromeInstalled();
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
