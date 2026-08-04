const express = require('express');
const router  = express.Router();
const db      = require('../db/init');

// ---------- ACADEMIC SETTINGS (Academic Year / Semester) ----------
router.get('/settings', async (req, res) => {
  try {
    const r = await db.execute(`SELECT academic_year, semester FROM academic_settings WHERE id = 1`);
    res.json(r.rows[0] || { academic_year: '2025-2026', semester: '1st Semester' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/settings', async (req, res) => {
  const { academic_year, semester } = req.body;
  if (!academic_year?.trim()) return res.status(400).json({ error: 'Academic Year is required.' });
  if (!['1st Semester','2nd Semester','Summer'].includes(semester)) return res.status(400).json({ error: 'Invalid semester.' });
  try {
    await db.execute({
      sql: `UPDATE academic_settings SET academic_year = ?, semester = ? WHERE id = 1`,
      args: [academic_year.trim(), semester]
    });
    res.json({ academic_year: academic_year.trim(), semester });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- MAJORS ----------
router.get('/majors', async (req, res) => {
  try {
    const r = await db.execute(`SELECT * FROM majors ORDER BY type, name`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/majors', async (req, res) => {
  const { name, type } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  const mtype = ['Major','Minor','Course'].includes(type) ? type : 'Major';
  try {
    const info = await db.execute({ sql: `INSERT INTO majors (name, type) VALUES (?, ?)`, args: [name.trim(), mtype] });
    res.status(201).json({ id: Number(info.lastInsertRowid), name: name.trim(), type: mtype });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Name already exists.' });
    res.status(500).json({ error: e.message });
  }
});
router.put('/majors/:id', async (req, res) => {
  const { name, type } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  try {
    const existing = await db.execute({ sql: `SELECT id FROM majors WHERE id = ?`, args: [req.params.id] });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found.' });
    const mtype = ['Major','Minor','Course'].includes(type) ? type : 'Major';
    await db.execute({ sql: `UPDATE majors SET name = ?, type = ? WHERE id = ?`, args: [name.trim(), mtype, req.params.id] });
    res.json({ id: parseInt(req.params.id), name: name.trim(), type: mtype });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Name already exists.' });
    res.status(500).json({ error: e.message });
  }
});
router.delete('/majors/:id', async (req, res) => {
  try {
    const inUseR = await db.execute({ sql: `SELECT COUNT(*) AS c FROM subjects WHERE major_id = ?`, args: [req.params.id] });
    if (inUseR.rows[0].c > 0) return res.status(409).json({ error: 'Cannot delete: major is used by existing subjects.' });
    await db.execute({ sql: `DELETE FROM majors WHERE id = ?`, args: [req.params.id] });
    await db.execute({ sql: `DELETE FROM instructor_majors WHERE major_id = ?`, args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- ROOMS ----------
router.get('/rooms', async (req, res) => {
  try {
    const r = await db.execute(`SELECT * FROM rooms ORDER BY name`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/rooms', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Room name is required.' });
  try {
    const info = await db.execute({ sql: `INSERT INTO rooms (name) VALUES (?)`, args: [name.trim()] });
    res.status(201).json({ id: Number(info.lastInsertRowid), name: name.trim() });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Room already exists.' });
    res.status(500).json({ error: e.message });
  }
});
router.put('/rooms/:id', async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Room name is required.' });
  try {
    const existing = await db.execute({ sql: `SELECT id FROM rooms WHERE id = ?`, args: [req.params.id] });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found.' });
    await db.execute({ sql: `UPDATE rooms SET name = ? WHERE id = ?`, args: [name.trim(), req.params.id] });
    res.json({ id: parseInt(req.params.id), name: name.trim() });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Room name already exists.' });
    res.status(500).json({ error: e.message });
  }
});
router.delete('/rooms/:id', async (req, res) => {
  try {
    const inUseR = await db.execute({ sql: `SELECT COUNT(*) AS c FROM schedules WHERE room_id = ?`, args: [req.params.id] });
    if (inUseR.rows[0].c > 0) return res.status(409).json({ error: 'Cannot delete: room is used by existing schedules.' });
    await db.execute({ sql: `DELETE FROM rooms WHERE id = ?`, args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- DAY CLUSTERS ----------
router.get('/day-clusters', async (req, res) => {
  try {
    const r = await db.execute(`SELECT * FROM day_clusters ORDER BY id`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/day-clusters', async (req, res) => {
  const { key, label, display } = req.body;
  if (!key || !label) return res.status(400).json({ error: 'key and label are required.' });
  try {
    const info = await db.execute({
      sql: `INSERT INTO day_clusters (key, label, display) VALUES (?, ?, ?)`,
      args: [key.trim(), label.trim(), (display || key).trim()]
    });
    res.status(201).json({ id: Number(info.lastInsertRowid), key: key.trim(), label: label.trim(), display: (display||key).trim() });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Day cluster key already exists.' });
    res.status(500).json({ error: e.message });
  }
});
router.put('/day-clusters/:id', async (req, res) => {
  const { key, label, display } = req.body;
  if (!key || !label) return res.status(400).json({ error: 'key and label are required.' });
  try {
    const existingR = await db.execute({ sql: `SELECT * FROM day_clusters WHERE id = ?`, args: [req.params.id] });
    const existing = existingR.rows[0];
    if (!existing) return res.status(404).json({ error: 'Not found.' });
    if (existing.key !== key.trim())
      await db.execute({ sql: `UPDATE schedules SET day_key = ? WHERE day_key = ?`, args: [key.trim(), existing.key] });
    await db.execute({
      sql: `UPDATE day_clusters SET key = ?, label = ?, display = ? WHERE id = ?`,
      args: [key.trim(), label.trim(), (display||key).trim(), req.params.id]
    });
    res.json({ id: parseInt(req.params.id), key: key.trim(), label: label.trim(), display: (display||key).trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.delete('/day-clusters/:id', async (req, res) => {
  try {
    const rowR = await db.execute({ sql: `SELECT key FROM day_clusters WHERE id = ?`, args: [req.params.id] });
    const row = rowR.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const inUseR = await db.execute({ sql: `SELECT COUNT(*) AS c FROM schedules WHERE day_key = ?`, args: [row.key] });
    if (inUseR.rows[0].c > 0) return res.status(409).json({ error: 'Cannot delete: day cluster is used by existing schedules.' });
    await db.execute({ sql: `DELETE FROM day_clusters WHERE id = ?`, args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- TIMESLOTS ----------
router.get('/timeslots', async (req, res) => {
  try {
    const r = await db.execute(`SELECT * FROM timeslots ORDER BY sort_order, id`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/timeslots', async (req, res) => {
  const { label, sort_order, is_lunch_marker } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: 'Timeslot label is required.' });
  try {
    const maxR = await db.execute(`SELECT MAX(sort_order) AS m FROM timeslots`);
    const maxOrder = maxR.rows[0].m || 0;
    const finalOrder = sort_order ?? (maxOrder + 1);
    const info = await db.execute({
      sql: `INSERT INTO timeslots (label, sort_order, is_lunch_marker) VALUES (?, ?, ?)`,
      args: [label.trim(), finalOrder, is_lunch_marker ? 1 : 0]
    });
    res.status(201).json({ id: Number(info.lastInsertRowid), label: label.trim(), sort_order: finalOrder, is_lunch_marker: is_lunch_marker ? 1 : 0 });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Timeslot already exists.' });
    res.status(500).json({ error: e.message });
  }
});
router.put('/timeslots/:id', async (req, res) => {
  const { label, is_lunch_marker, sort_order } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: 'Timeslot label is required.' });
  try {
    const existingR = await db.execute({ sql: `SELECT * FROM timeslots WHERE id = ?`, args: [req.params.id] });
    const existing = existingR.rows[0];
    if (!existing) return res.status(404).json({ error: 'Not found.' });
    if (existing.label !== label.trim())
      await db.execute({ sql: `UPDATE schedules SET timeslot_label = ? WHERE timeslot_label = ?`, args: [label.trim(), existing.label] });
    const newOrder = sort_order ?? existing.sort_order;
    await db.execute({
      sql: `UPDATE timeslots SET label = ?, is_lunch_marker = ?, sort_order = ? WHERE id = ?`,
      args: [label.trim(), is_lunch_marker ? 1 : 0, newOrder, req.params.id]
    });
    res.json({ id: parseInt(req.params.id), label: label.trim(), is_lunch_marker: is_lunch_marker ? 1 : 0, sort_order: newOrder });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.delete('/timeslots/:id', async (req, res) => {
  try {
    const rowR = await db.execute({ sql: `SELECT label FROM timeslots WHERE id = ?`, args: [req.params.id] });
    const row = rowR.rows[0];
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const inUseR = await db.execute({ sql: `SELECT COUNT(*) AS c FROM schedules WHERE timeslot_label = ?`, args: [row.label] });
    if (inUseR.rows[0].c > 0) return res.status(409).json({ error: 'Cannot delete: timeslot is used by existing schedules.' });
    await db.execute({ sql: `DELETE FROM timeslots WHERE id = ?`, args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
