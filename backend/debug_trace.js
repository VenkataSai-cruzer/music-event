/**
 * LIVE DIAGNOSTIC — traces PDF generation and download chain
 * Run while server is running: node debug_trace.js
 */
const http = require('http');
const path = require('path');

const BASE = 'http://localhost:5000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ECE1AE56';

function req(method, url, data, auth) {
  return new Promise((resolve, reject) => {
    const u = new URL(url.startsWith('http') ? url : BASE + url);
    const opts = {
      method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (auth) opts.headers['Authorization'] = 'Bearer ' + auth;
    const r = http.request(opts, (res) => {
      let body = [];
      res.on('data', c => body.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(body);
        const ct = res.headers['content-type'] || '';
        if (ct.includes('application/pdf')) {
          resolve({ status: res.statusCode, pdfSize: raw.length, headers: res.headers });
        } else {
          try { resolve({ status: res.statusCode, data: JSON.parse(raw.toString()) }); }
          catch (e) { resolve({ status: res.statusCode, raw: raw.toString().slice(0, 500) }); }
        }
      });
    });
    r.on('error', reject);
    if (data) r.write(JSON.stringify(data));
    r.end();
  });
}

(async () => {
  console.log('\n=== STEP 1: Login ===');
  const loginRes = await req('POST', '/api/auth/login', { username: 'admin', password: PASSWORD });
  console.log('Status:', loginRes.status, '| Data:', JSON.stringify(loginRes.data).slice(0, 200));
  const token = loginRes.data?.token;
  if (!token) { console.log('LOGIN FAILED — aborting'); process.exit(1); }
  console.log('Token obtained:', token.slice(0, 30) + '...');

  console.log('\n=== STEP 2: Check event_settings table ===');
  try {
    const pool = require('./db/db');
    const evRes = await pool.query('SELECT * FROM event_settings WHERE id = 1');
    console.log('Event settings:', evRes.rows.length > 0 ? JSON.stringify(evRes.rows[0]).slice(0, 300) : 'EMPTY — table has no data');
  } catch (e) { console.log('Event settings ERROR:', e.message); }

  console.log('\n=== STEP 3: Check open-sans-fonts ===');
  const fs = require('fs');
  const fontPath = path.join(__dirname, 'node_modules', 'open-sans-fonts', 'open-sans', 'Regular', 'OpenSans-Regular.ttf');
  console.log('Font exists?', fs.existsSync(fontPath));
  if (!fs.existsSync(fontPath)) {
    // Check what fonts are available
    const fontDir = path.join(__dirname, 'node_modules', 'open-sans-fonts');
    console.log('open-sans-fonts dir exists?', fs.existsSync(fontDir));
    if (fs.existsSync(fontDir)) {
      const ls = require('child_process').execSync('dir /s /b "' + fontDir + '" 2>nul || find "' + fontDir + '" -name "*.ttf" 2>/dev/null').toString();
      console.log('Font files:', ls.slice(0, 500));
    }
  }

  console.log('\n=== STEP 4: Try preview on demo ticket ===');
  const prevRes = await req('GET', '/api/tickets/preview/ME-2026-000001', null, token);
  console.log('Preview status:', prevRes.status);
  if (prevRes.data) console.log('Preview error:', JSON.stringify(prevRes.data).slice(0, 300));
  if (prevRes.pdfSize) console.log('Preview PDF size:', prevRes.pdfSize, 'bytes');

  console.log('\n=== STEP 5: Try download on demo ticket ===');
  const dlRes = await req('GET', '/api/tickets/download/ME-2026-000001', null, token);
  console.log('Download status:', dlRes.status);
  if (dlRes.data) console.log('Download error:', JSON.stringify(dlRes.data).slice(0, 300));
  if (dlRes.pdfSize) console.log('Download PDF size:', dlRes.pdfSize, 'bytes');

  console.log('\n=== STEP 6: Try regenerate ===');
  const regRes = await req('POST', '/api/tickets/ME-2026-000002/regenerate-pdf', null, token);
  console.log('Regenerate status:', regRes.status);
  console.log('Regenerate result:', JSON.stringify(regRes.data).slice(0, 300));

  console.log('\n=== STEP 7: Create a NEW ticket ===');
  const createRes = await req('POST', '/api/tickets', {
    name: 'Diagnostic User',
    gender: 'Male',
    email: 'diag@test.com',
    mobile: '+91 99999 00000',
    clientRequestId: 'diag-' + Date.now(),
  }, token);
  console.log('Create status:', createRes.status);
  console.log('Create result:', JSON.stringify(createRes.data).slice(0, 500));
  const newTicketId = createRes.data?.data?.ticketId;

  if (newTicketId) {
    console.log('\n=== STEP 8: Download newly created ticket ===');
    const newDl = await req('GET', '/api/tickets/download/' + newTicketId, null, token);
    console.log('New download status:', newDl.status);
    if (newDl.data) console.log('New download error:', JSON.stringify(newDl.data).slice(0, 300));
    if (newDl.pdfSize) console.log('New download PDF size:', newDl.pdfSize, 'bytes');
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
