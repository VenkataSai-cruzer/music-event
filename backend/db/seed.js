/**
 * Demo Data Seeder
 *
 * Run: node db/seed.js
 *
 * Inserts sample registrations into the tickets table for
 * demonstration and testing purposes.
 *
 * Safe to run multiple times — checks for existing demo data first.
 * Only seeds if no existing tickets are found.
 */

const pool = require('./db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ── Demo registrants — mix of VALID, USED, and CANCELLED ──
const DEMO_REGISTRATIONS = [
  { name: 'Arjun Sharma',       gender: 'Male',   email: 'arjun.sharma@gmail.com',        mobile: '+91 98765 43201' },
  { name: 'Priya Patel',        gender: 'Female',  email: 'priya.patel@yahoo.com',         mobile: '+91 98765 43202' },
  { name: 'Rahul Verma',         gender: 'Male',   email: 'rahul.verma@outlook.com',       mobile: '+91 98765 43203' },
  { name: 'Sneha Reddy',         gender: 'Female',  email: 'sneha.reddy@gmail.com',         mobile: '+91 98765 43204' },
  { name: 'Vikram Singh',        gender: 'Male',   email: 'vikram.singh@rediffmail.com',   mobile: '+91 98765 43205' },
  { name: 'Ananya Gupta',        gender: 'Female',  email: 'ananya.gupta@icloud.com',       mobile: '+91 98765 43206' },
  { name: 'Rohit Joshi',         gender: 'Male',   email: 'rohit.joshi@protonmail.com',    mobile: '+91 98765 43207' },
  { name: 'Kavita Nair',         gender: 'Female',  email: 'kavita.nair@gmail.com',         mobile: '+91 98765 43208' },
  { name: 'Amit Deshmukh',       gender: 'Male',   email: 'amit.deshmukh@yahoo.com',       mobile: '+91 98765 43209' },
  { name: 'Ishita Mehta',        gender: 'Female',  email: 'ishita.mehta@outlook.com',      mobile: '+91 98765 43210' },
  { name: 'Siddharth Rao',       gender: 'Male',   email: 'sid.rao@gmail.com',             mobile: '+91 98765 43211' },
  { name: 'Pooja Iyer',          gender: 'Female',  email: 'pooja.iyer@yahoo.com',          mobile: '+91 98765 43212' },
  { name: 'Manoj Kumar',         gender: 'Male',   email: 'manoj.kumar@hotmail.com',        mobile: '+91 98765 43213' },
  { name: 'Divya Menon',         gender: 'Female',  email: 'divya.menon@gmail.com',         mobile: '+91 98765 43214' },
  { name: 'Karthik Rajan',       gender: 'Male',   email: 'karthik.rajan@outlook.com',      mobile: '+91 98765 43215' },
  { name: 'Nandini Chandra',     gender: 'Female',  email: 'nandini.chandra@gmail.com',     mobile: '+91 98765 43216' },
  { name: 'Harsh Agarwal',       gender: 'Male',   email: 'harsh.agarwal@protonmail.com',   mobile: '+91 98765 43217' },
  { name: 'Meera Krishnan',      gender: 'Female',  email: 'meera.krishnan@yahoo.com',      mobile: '+91 98765 43218' },
  { name: 'Deepak Murthy',       gender: 'Male',   email: 'deepak.murthy@gmail.com',        mobile: '+91 98765 43219' },
  { name: 'Tanvi Saxena',        gender: 'Female',  email: 'tanvi.saxena@icloud.com',       mobile: '+91 98765 43220' },
  { name: 'Akash Bhatia',        gender: 'Male',   email: 'akash.bhatia@gmail.com',         mobile: '+91 98765 43221' },
  { name: 'Riya Kapoor',         gender: 'Female',  email: 'riya.kapoor@outlook.com',       mobile: '+91 98765 43222' },
  { name: 'Sandeep Chauhan',     gender: 'Male',   email: 'sandeep.chauhan@yahoo.com',      mobile: '+91 98765 43223' },
  { name: 'Neha Thakur',         gender: 'Female',  email: 'neha.thakur@gmail.com',         mobile: '+91 98765 43224' },
  { name: 'Gaurav Mishra',       gender: 'Male',   email: 'gaurav.mishra@hotmail.com',      mobile: '+91 98765 43225' },
];

// Demo scanners (matches init.js seed accounts)
const SCANNERS = ['Gate A - Main Entrance', 'Gate B - Side Entrance', 'VIP Entrance'];

async function seedDemoData() {
  console.log('🔍 Checking for existing ticket data...');

  const existing = await pool.query('SELECT COUNT(*) FROM tickets');
  const count = parseInt(existing.rows[0].count, 10);

  if (count > 0) {
    console.log(`⚠️  Database already has ${count} ticket(s). Skipping seed to avoid duplicates.`);
    console.log('   To re-seed, run: TRUNCATE tickets RESTART IDENTITY CASCADE;');
    console.log('   Then run: node db/seed.js');
    return;
  }

  console.log(`📋 Inserting ${DEMO_REGISTRATIONS.length} demo registrations...\n`);

  const now = new Date();
  const eventDate = new Date('2026-08-08T17:30:00');

  for (let i = 0; i < DEMO_REGISTRATIONS.length; i++) {
    const reg = DEMO_REGISTRATIONS[i];
    const qrToken = uuidv4();
    const ticketId = `ME-2026-${String(i + 1).padStart(6, '0')}`;

    // Spread created_at across the past few days for realistic demo data
    const daysAgo = Math.floor(Math.random() * 14); // 0–14 days ago
    const createdOffset = daysAgo * 24 * 60 * 60 * 1000 + Math.floor(Math.random() * 86400000);
    const createdAt = new Date(now.getTime() - createdOffset);

    // Determine status: ~60% VALID, ~30% USED, ~10% CANCELLED
    let status;
    let scannedAt = null;
    let scannedBy = null;
    let cancelledAt = null;
    const rand = Math.random();

    if (rand < 0.6) {
      status = 'VALID';
    } else if (rand < 0.9) {
      // USED — scanned at a time after creation
      status = 'USED';
      const scanDelay = Math.floor(Math.random() * 3) + 1; // 1–3 days after creation
      const scanOffset = scanDelay * 24 * 60 * 60 * 1000 + Math.floor(Math.random() * 3600000);
      scannedAt = new Date(createdAt.getTime() + scanOffset);
      scannedBy = SCANNERS[Math.floor(Math.random() * SCANNERS.length)];
    } else {
      // CANCELLED
      status = 'CANCELLED';
      cancelledAt = new Date(createdAt.getTime() + Math.floor(Math.random() * 86400000));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO tickets (ticket_id, qr_token, name, gender, email, mobile, status,
                              scanned_by, scanned_at, created_at, updated_at, cancelled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [ticketId, qrToken, reg.name, reg.gender, reg.email, reg.mobile, status,
         scannedBy, scannedAt, createdAt, createdAt, cancelledAt]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`   ✗ Failed to insert ${reg.name}: ${err.message}`);
    } finally {
      client.release();
    }

    const statusIcon = status === 'VALID' ? '🟢' : status === 'USED' ? '🔵' : '🔴';
    console.log(`   ${statusIcon} ${ticketId}  ${reg.name.padEnd(18)} ${reg.email.padEnd(30)} ${status}`);
  }

  // ── Sync the ticket_id_seq to avoid collision ──
  await pool.query(`ALTER SEQUENCE ticket_id_seq RESTART WITH ${DEMO_REGISTRATIONS.length + 1};`);

  console.log(`\n✅ Seeded ${DEMO_REGISTRATIONS.length} demo registrations successfully.`);
  console.log(`   🟢 VALID:     ~${Math.round(DEMO_REGISTRATIONS.length * 0.6)}`);
  console.log(`   🔵 USED:      ~${Math.round(DEMO_REGISTRATIONS.length * 0.3)}`);
  console.log(`   🔴 CANCELLED: ~${Math.round(DEMO_REGISTRATIONS.length * 0.1)}`);
  console.log('\n   📱 Scanner login: gate_a / scan123');
  console.log('   🔑 Admin login:    admin / admin123');

  await pool.end();
}

seedDemoData().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
