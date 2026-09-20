// One-off production bootstrap. Migration 012 seeds two demo logins with passwords that are
// written in the migration file, so on a real server run this right after `npm run migrate`:
//
//   ADMIN_EMAIL=you@rsrbakes.in ADMIN_NAME="Raees A." ADMIN_PASSWORD='a-long-password' \
//     node scripts/set-admin.cjs [--remove-sample-data]
//
// It (1) points the seeded admin row at the real email/name/password, (2) locks every other
// seeded demo login (random password + inactive), and (3) with --remove-sample-data deletes the
// demo suppliers/items (migration 009) and delivery locations (011) when nothing references them yet.
// Expense categories and accounts (migration 017) are real setup and are kept.
// Safe to re-run. The password is taken from the environment so it never lands in shell history
// as a command argument or in a file.
require('dotenv/config');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const SEEDED_EMAILS = ['admin@rsrbakes.com', 'staff@rsrbakes.com'];
const SAMPLE_ITEM_CODES = ['RM-001', 'RM-002', 'RM-003', 'RM-004', 'PK-001'];
const SAMPLE_SUPPLIERS = ['Al Ameen Poultry, Kollam', 'Chinnakada Vegetable Mandi'];
const SAMPLE_LOCATIONS = ['Kollam Production Unit', 'Cold Store — Chinnakada'];

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email.includes('@') || !name || password.length < 12) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (at least 12 characters).');
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const hash = await bcrypt.hash(password, 12);
  const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
  let adminId;
  if (existing.length) {
    adminId = existing[0].id;
    await conn.query('UPDATE users SET name = ?, password_hash = ?, role = 1, status = 2, is_active = 1 WHERE id = ?', [name, hash, adminId]);
  } else {
    const [seeded] = await conn.query('SELECT id FROM users WHERE email = ?', [SEEDED_EMAILS[0]]);
    if (seeded.length) {
      adminId = seeded[0].id;
      await conn.query('UPDATE users SET email = ?, name = ?, password_hash = ?, role = 1, status = 2, is_active = 1 WHERE id = ?', [email, name, hash, adminId]);
    } else {
      const [res] = await conn.query('INSERT INTO users (email, name, password_hash, role, status) VALUES (?, ?, ?, 1, 2)', [email, name, hash]);
      adminId = res.insertId;
    }
  }
  console.log(`admin ready: ${email} (id ${adminId})`);

  for (const seededEmail of SEEDED_EMAILS) {
    const lock = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const [res] = await conn.query('UPDATE users SET password_hash = ?, is_active = 0 WHERE email = ? AND id <> ?', [lock, seededEmail, adminId]);
    if (res.affectedRows) console.log(`locked demo login: ${seededEmail}`);
  }

  if (process.argv.includes('--remove-sample-data')) {
    for (const code of SAMPLE_ITEM_CODES) await tryDelete(conn, 'items', 'code', code);
    for (const supplier of SAMPLE_SUPPLIERS) await tryDelete(conn, 'suppliers', 'name', supplier);
    for (const location of SAMPLE_LOCATIONS) await tryDelete(conn, 'delivery_locations', 'name', location);
  }

  await conn.end();
}

async function tryDelete(conn, table, column, value) {
  try {
    const [res] = await conn.query(`DELETE FROM ${table} WHERE ${column} = ?`, [value]);
    if (res.affectedRows) console.log(`removed sample ${table}: ${value}`);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') console.log(`kept ${table}: ${value} (already used by real records)`);
    else throw err;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
