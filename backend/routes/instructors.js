const express = require('express');
const router  = express.Router();
const db      = require('../db/init');

async function attachMajors(instructor) {
  const r = await db.execute({
    sql: `SELECT m.id, m.name, m.type FROM instructor_majors im
          JOIN majors m ON m.id = im.major_id
          WHERE im.instructor_id = ?
          ORDER BY m.type, m.name`,
    args: [instructor.id]
  });
  return { ...instructor, majors: r.rows };
}

async function attachCanHandle(instructor) {
  const r = await db.execute({
    sql: `SELECT m.id, m.name, m.type FROM instructor_can_handle ich
          JOIN majors m ON m.id = ich.major_id
          WHERE ich.instructor_id = ?
          ORDER BY m.type, m.name`,
    args: [instructor.id]
  });
  return { ...instructor, can_handle: r.rows };
}

async function attachAll(inst) {
  return attachCanHandle(await attachMajors(inst));
}

router.get('/instructors', async (req, res) => {
  try {
    const r = await db.execute(`SELECT * FROM instructors ORDER BY name`);
    res.json(await Promise.all(r.rows.map(attachAll)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/instructors/:id', async (req, res) => {
  try {
    const r = await db.execute({ sql: `SELECT * FROM instructors WHERE id = ?`, args: [req.params.id] });
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'Instructor not found.' });
    res.json(await attachAll(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/instructors', async (req, res) => {
  const { name, status, rank, qualification, years_service, salary_grade, designation, designation_units, special_assignment, special_assignment_units, major_ids, can_handle_ids } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Instructor name is required.' });
  if (!Array.isArray(major_ids) || major_ids.length === 0)
    return res.status(400).json({ error: 'Select at least one major.' });
  const tx = await db.transaction('write');
  try {
    const info = await tx.execute({
      sql: `INSERT INTO instructors (name, status, rank, qualification, years_service, salary_grade, designation, designation_units, special_assignment, special_assignment_units)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [name.trim(), status||'Permanent', rank||null, qualification||null, years_service||0, salary_grade||null, (designation||'').trim()||null, designation_units||0, (special_assignment||'').trim()||null, special_assignment_units||0]
    });
    const instId = Number(info.lastInsertRowid);
    for (const mid of major_ids)
      await tx.execute({ sql: `INSERT INTO instructor_majors (instructor_id, major_id) VALUES (?,?)`, args: [instId, mid] });
    if (Array.isArray(can_handle_ids))
      for (const mid of can_handle_ids)
        await tx.execute({ sql: `INSERT INTO instructor_can_handle (instructor_id, major_id) VALUES (?,?)`, args: [instId, mid] });
    await tx.commit();
    const r = await db.execute({ sql: `SELECT * FROM instructors WHERE id = ?`, args: [instId] });
    res.status(201).json(await attachAll(r.rows[0]));
  } catch (e) { await tx.rollback(); res.status(500).json({ error: e.message }); }
});

router.put('/instructors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const existingR = await db.execute({ sql: `SELECT * FROM instructors WHERE id = ?`, args: [id] });
    const existing = existingR.rows[0];
    if (!existing) return res.status(404).json({ error: 'Instructor not found.' });
    const { name, status, rank, qualification, years_service, salary_grade, designation, designation_units, special_assignment, special_assignment_units, major_ids, can_handle_ids } = req.body;
    const tx = await db.transaction('write');
    try {
      await tx.execute({
        sql: `UPDATE instructors SET name=?,status=?,rank=?,qualification=?,years_service=?,salary_grade=?,designation=?,designation_units=?,special_assignment=?,special_assignment_units=? WHERE id=?`,
        args: [name?.trim()||existing.name, status||existing.status, rank??existing.rank,
               qualification??existing.qualification, years_service??existing.years_service,
               salary_grade??existing.salary_grade,
               (designation!==undefined?(designation||'').trim()||null:existing.designation),
               (designation_units!==undefined?(designation_units||0):existing.designation_units),
               (special_assignment!==undefined?(special_assignment||'').trim()||null:existing.special_assignment),
               (special_assignment_units!==undefined?(special_assignment_units||0):existing.special_assignment_units), id]
      });
      if (Array.isArray(major_ids)) {
        await tx.execute({ sql: `DELETE FROM instructor_majors WHERE instructor_id=?`, args: [id] });
        for (const mid of major_ids)
          await tx.execute({ sql: `INSERT INTO instructor_majors (instructor_id, major_id) VALUES (?,?)`, args: [id, mid] });
      }
      if (Array.isArray(can_handle_ids)) {
        await tx.execute({ sql: `DELETE FROM instructor_can_handle WHERE instructor_id=?`, args: [id] });
        for (const mid of can_handle_ids)
          await tx.execute({ sql: `INSERT INTO instructor_can_handle (instructor_id, major_id) VALUES (?,?)`, args: [id, mid] });
      }
      await tx.commit();
      const r = await db.execute({ sql: `SELECT * FROM instructors WHERE id = ?`, args: [id] });
      res.json(await attachAll(r.rows[0]));
    } catch (e) { await tx.rollback(); res.status(500).json({ error: e.message }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/instructors/:id', async (req, res) => {
  try {
    await db.execute({ sql: `DELETE FROM schedules             WHERE instructor_id=?`, args: [req.params.id] });
    await db.execute({ sql: `DELETE FROM instructor_can_handle WHERE instructor_id=?`, args: [req.params.id] });
    await db.execute({ sql: `DELETE FROM instructors            WHERE id=?`,           args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
