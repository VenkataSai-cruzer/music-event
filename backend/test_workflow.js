/**
 * End-to-End Workflow Test
 * Tests: create registration → auto-generate PDF → download PDF → verify
 * Run: node test_workflow.js
 */

const http = require('http');
const pool = require('./db/db');

const API = 'http://localhost:5000';
let TOKEN = null;
let TICKET_ID = null;

function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        if (ct.includes('application/json')) {
          try { resolve({ status: res.statusCode, data: JSON.parse(raw.toString()), raw }); }
          catch (e) { resolve({ status: res.statusCode, data: raw.toString(), raw }); }
        } else {
          resolve({ status: res.statusCode, data: raw, raw, contentType: ct });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  END-TO-END WORKFLOW TEST');
  console.log('═══════════════════════════════════════\n');

  // Step 1: Login
  console.log('📌 Step 1: Admin Login');
  const loginRes = await apiRequest('POST', '/api/auth/login', {
    username: 'admin',
    password: process.env.ADMIN_PASSWORD || 'ECE1AE56',
  });
  if (loginRes.status !== 200) {
    console.error(`   ❌ FAIL - Status ${loginRes.status}: ${JSON.stringify(loginRes.data)}`);
    process.exit(1);
  }
  TOKEN = loginRes.data.token;
  console.log(`   ✅ Login successful (token: ${TOKEN.substring(0, 20)}...)`);

  // Step 2: Create Registration
  console.log('\n📌 Step 2: Create Registration');
  const createRes = await apiRequest('POST', '/api/tickets', {
    name: 'E2E Test User',
    gender: 'Female',
    email: 'e2e@test.com',
    mobile: '+91 11111 22222',
    clientRequestId: `e2e-test-${Date.now()}`,
  }, TOKEN);
  
  if (createRes.status !== 201) {
    console.error(`   ❌ FAIL - Status ${createRes.status}: ${JSON.stringify(createRes.data)}`);
    process.exit(1);
  }
  
  const ticket = createRes.data.data || createRes.data;
  TICKET_ID = ticket.ticketId || ticket.ticket_id;
  const hasPdf = ticket.hasPdf || ticket.pdf_data;
  console.log(`   ✅ Registration created: ${TICKET_ID}`);
  console.log(`   📄 PDF generated: ${hasPdf ? 'YES' : 'NO'}`);
  console.log(`   📋 Response: ${JSON.stringify(createRes.data).substring(0, 300)}`);

  // Step 3: Verify DB record
  console.log('\n📌 Step 3: Verify Database Record');
  const dbRes = await pool.query(
    'SELECT ticket_id, status, length(pdf_data)::int as pdf_size FROM tickets WHERE ticket_id = $1',
    [TICKET_ID]
  );
  const dbTicket = dbRes.rows[0];
  if (!dbTicket) {
    console.error('   ❌ FAIL - Ticket not found in database');
    process.exit(1);
  }
  console.log(`   ✅ DB record: ${dbTicket.ticket_id} | Status: ${dbTicket.status} | PDF size: ${dbTicket.pdf_size || 0} bytes`);

  // Step 4: Download PDF
  console.log('\n📌 Step 4: Download PDF');
  const dlRes = await apiRequest('GET', `/api/tickets/download/${TICKET_ID}`, null, TOKEN);
  console.log(`   Status: ${dlRes.status}, Content-Type: ${dlRes.contentType || 'N/A'}, Size: ${dlRes.raw.length} bytes`);
  
  if (dlRes.status !== 200) {
    const errMsg = dlRes.data && dlRes.data.message ? dlRes.data.message :
                   dlRes.data && dlRes.data.error ? dlRes.data.error :
                   dlRes.data && dlRes.data.toString ? dlRes.data.toString() : 'Unknown error';
    console.error(`   ❌ FAIL - Download returned ${dlRes.status}: ${errMsg}`);
    console.error(`   Full response: ${JSON.stringify(dlRes.data).substring(0, 500)}`);
    process.exit(1);
  }
  
  // Verify it's a valid PDF
  const pdfHeader = dlRes.raw.slice(0, 5).toString();
  if (pdfHeader !== '%PDF-') {
    console.error(`   ❌ FAIL - Not a valid PDF (header: ${pdfHeader})`);
    process.exit(1);
  }
  console.log(`   ✅ PDF downloaded successfully (${dlRes.raw.length} bytes, valid PDF header)`);

  // Step 5: Preview PDF
  console.log('\n📌 Step 5: Preview PDF');
  const prevRes = await apiRequest('GET', `/api/tickets/preview/${TICKET_ID}`, null, TOKEN);
  if (prevRes.status !== 200) {
    console.error(`   ❌ FAIL - Preview returned ${prevRes.status}`);
    process.exit(1);
  }
  const prevHeader = prevRes.raw.slice(0, 5).toString();
  if (prevHeader !== '%PDF-') {
    console.error(`   ❌ FAIL - Not a valid PDF for preview (header: ${prevHeader})`);
    process.exit(1);
  }
  console.log(`   ✅ Preview works (${prevRes.raw.length} bytes, inline)`);

  // Step 6: Verify QR on scanner endpoint
  console.log('\n📌 Step 6: Verify QR (Scanner)');
  const dbQrRes = await pool.query('SELECT qr_token FROM tickets WHERE ticket_id = $1', [TICKET_ID]);
  const qrToken = dbQrRes.rows[0].qr_token;
  
  const scanRes = await apiRequest('POST', '/api/tickets/verify', {
    qr_token: qrToken,
    scanned_by: 'Test Gate',
  });
  
  if (scanRes.data.action !== 'approved' && scanRes.data.result !== 'APPROVED') {
    console.error(`   ❌ FAIL - First scan not approved: ${JSON.stringify(scanRes.data)}`);
    process.exit(1);
  }
  console.log(`   ✅ First scan: APPROVED`);

  // Step 7: Second scan (should be ALREADY_USED)
  console.log('\n📌 Step 7: Second Scan (should be rejected)');
  const scan2Res = await apiRequest('POST', '/api/tickets/verify', {
    qr_token: qrToken,
    scanned_by: 'Test Gate 2',
  });
  
  if (scan2Res.data.action === 'already_used' || scan2Res.data.result === 'ALREADY_USED') {
    console.log('   ✅ Second scan: ALREADY_USED (correct)');
  } else {
    console.error(`   ❌ FAIL - Expected ALREADY_USED, got: ${JSON.stringify(scan2Res.data)}`);
    process.exit(1);
  }

  // Done
  console.log('\n═══════════════════════════════════════');
  console.log('  ✅ ALL TESTS PASSED');
  console.log('  ✅ Create → PDF → Download → Preview → Scan → Reject');
  console.log('═══════════════════════════════════════');

  await pool.end();
}

main().catch(err => {
  console.error('\n❌ TEST FAILED WITH ERROR:', err.message);
  process.exit(1);
});
