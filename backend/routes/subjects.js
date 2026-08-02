const express = require('express');
const router  = express.Router();
const db      = require('../db/init');

async function withMeta(row) {
  if (!row) return row;
  const r = await db.execute({ sql: `SELECT id, name FROM majors WHERE id = ?`, args: [row.major_id] });
  const major = r.rows[0];
  return { ...row, major_name: major ? major.name : null, year_level: row.year_level ?? 0, program: row.program || 'Both', is_lab: row.is_lab ?? 0 };
}

router.get('/subjects', async (req, res) => {
  try {
    const r = await db.execute(`SELECT * FROM subjects ORDER BY program, year_level, code`);
    res.json(await Promise.all(r.rows.map(withMeta)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/subjects', async (req, res) => {
  const { code, descr, units, major_id, year_level, program, is_lab } = req.body;
  if (!code || !descr || !units || !major_id)
    return res.status(400).json({ error: 'code, descr, units, and major_id are required.' });
  try {
    const info = await db.execute({
      sql: `INSERT INTO subjects (code, descr, units, major_id, year_level, program, is_lab) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [code.trim(), descr.trim(), units, major_id, year_level ?? 0, program || 'Both', is_lab ? 1 : 0]
    });
    const r = await db.execute({ sql: `SELECT * FROM subjects WHERE id = ?`, args: [Number(info.lastInsertRowid)] });
    res.status(201).json(await withMeta(r.rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/subjects/:id', async (req, res) => {
  try {
    const existingR = await db.execute({ sql: `SELECT * FROM subjects WHERE id = ?`, args: [req.params.id] });
    const existing = existingR.rows[0];
    if (!existing) return res.status(404).json({ error: 'Subject not found.' });
    const { code, descr, units, major_id, year_level, program, is_lab } = req.body;
    await db.execute({
      sql: `UPDATE subjects SET code=?, descr=?, units=?, major_id=?, year_level=?, program=?, is_lab=? WHERE id=?`,
      args: [
        (code || existing.code).trim(),
        (descr || existing.descr).trim(),
        units ?? existing.units,
        major_id ?? existing.major_id,
        year_level ?? existing.year_level,
        program || existing.program,
        is_lab !== undefined ? (is_lab ? 1 : 0) : (existing.is_lab ?? 0),
        req.params.id
      ]
    });
    const r = await db.execute({ sql: `SELECT * FROM subjects WHERE id = ?`, args: [req.params.id] });
    res.json(await withMeta(r.rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    const inUseR = await db.execute({ sql: `SELECT COUNT(*) AS c FROM schedules WHERE subject_id = ?`, args: [req.params.id] });
    if (inUseR.rows[0].c > 0) return res.status(409).json({ error: 'Cannot delete: subject is used by existing schedules.' });
    await db.execute({ sql: `DELETE FROM subjects WHERE id = ?`, args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
