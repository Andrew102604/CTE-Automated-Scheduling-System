// ============================================================
// Routes: Authentication
// - GET  /api/auth/status  → is admin account set up? is user logged in?
// - POST /api/auth/setup   → first-time: create the admin account
// - POST /api/auth/login   → login
// - POST /api/auth/logout  → logout
// - POST /api/auth/change-password → change credentials (must be logged in)
// ============================================================
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db/init');

async function getAdmin() {
  const r = await db.execute('SELECT * FROM admin_account WHERE id = 1');
  return r.rows[0] || null;
}

// GET /api/auth/status
router.get('/auth/status', async (req, res) => {
  try {
    const admin = await getAdmin();
    res.json({
      setup:     !!admin,
      logged_in: !!req.session.admin_logged_in
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/setup  — only works when NO admin account exists yet
router.post('/auth/setup', async (req, res) => {
  try {
    if (await getAdmin()) return res.status(409).json({ error: 'Admin account already exists. Use login instead.' });
    const { username, password } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: 'Username is required.' });
    if (!password || password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const hash = await bcrypt.hash(password, 12);
    await db.execute({ sql: 'INSERT INTO admin_account (id, username, password_hash) VALUES (1, ?, ?)', args: [username.trim(), hash] });
    req.session.admin_logged_in = true;
    req.session.save(() => {
      res.json({ ok: true, message: 'Admin account created and logged in.' });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const admin = await getAdmin();
    if (!admin) return res.status(404).json({ error: 'No admin account set up yet.' });
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    if (username.trim() !== admin.username) return res.status(401).json({ error: 'Invalid username or password.' });
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid username or password.' });
    req.session.admin_logged_in = true;
    req.session.save(() => {
      res.json({ ok: true });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// POST /api/auth/change-password  (must be logged in)
router.post('/auth/change-password', async (req, res) => {
  try {
    if (!req.session.admin_logged_in) return res.status(401).json({ error: 'Not logged in.' });
    const { username, current_password, new_password } = req.body;
    const admin = await getAdmin();
    if (!admin) return res.status(404).json({ error: 'No admin account found.' });
    const match = await bcrypt.compare(current_password, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    const hash = await bcrypt.hash(new_password, 12);
    await db.execute({
      sql: 'UPDATE admin_account SET username = ?, password_hash = ? WHERE id = 1',
      args: [(username || admin.username).trim(), hash]
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
