// ============================================================
// Routes: Schedules (+ Class Program / Workload read-views)
// Conflict detection logic ported 1:1 from the original
// frontend addSchedule() function.
// ============================================================
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// Parses a time like "9:00 AM", "09:00AM", "9:30 PM" into minutes-since-midnight.
function parseClock(t) {
  const m = String(t).trim().match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}
// Parses a timeslot label like "9:00 AM - 12:00 PM" into {start,end} minutes.
function parseTimeRange(label) {
  const parts = String(label).split('-');
  if (parts.length < 2) return null;
  const start = parseClock(parts[0]);
  const end = parseClock(parts.slice(1).join('-'));
  if (start == null || end == null) return null;
  return { start, end };
}
// True if two timeslot labels genuinely overlap in actual clock time (e.g.
// "9:00 AM - 12:00 PM" and "9:30 AM - 10:30 AM" overlap even though the
// label text differs). Falls back to exact-label match if either label
// can't be parsed, so unusual/custom labels still get *some* protection.
function timeslotsOverlap(labelA, labelB) {
  if (labelA === labelB) return true;
  const a = parseTimeRange(labelA), b = parseTimeRange(labelB);
  if (!a || !b) return false;
  return a.start < b.end && b.start < a.end;
}

async function fullSchedule(row) {
  const [instR, subjR, roomR] = await Promise.all([
    db.execute({ sql: `SELECT * FROM instructors WHERE id = ?`, args: [row.instructor_id] }),
    db.execute({ sql: `SELECT * FROM subjects WHERE id = ?`, args: [row.subject_id] }),
    db.execute({ sql: `SELECT * FROM rooms WHERE id = ?`, args: [row.room_id] })
  ]);
  const instructor = instR.rows[0];
  const subject = subjR.rows[0];
  const room = roomR.rows[0];
  return {
    id: row.id,
    instructor_id: row.instructor_id,
    instructor_name: instructor ? instructor.name : '—',
    subject_id: row.subject_id,
    code: subject ? subject.code : '—',
    desc: subject ? subject.descr : '—',
    units: subject ? subject.units : 0,
    section: row.section,
    num_students: row.num_students ?? 0,
    day_key: row.day_key,
    timeslot_label: row.timeslot_label,
    room_id: row.room_id,
    room_name: room ? room.name : '—',
    academic_year: row.academic_year,
    semester: row.semester
  };
}

// The CURRENT academic year + semester (from academic_settings) is what
// scopes every schedule read/write below — this is what keeps 2nd Semester
// loading from ever touching/deleting 1st Semester's saved schedules: each
// schedule row remembers which semester it was created under, and every
// query here only ever looks at rows matching what's currently set.
async function currentTerm() {
  const r = await db.execute(`SELECT academic_year, semester FROM academic_settings WHERE id = 1`);
  return r.rows[0] || { academic_year: '2025-2026', semester: '1st Semester' };
}

router.get('/schedules', async (req, res) => {
  try {
    const term = await currentTerm();
    const r = await db.execute({
      sql: `SELECT * FROM schedules WHERE academic_year = ? AND semester = ?`,
      args: [term.academic_year, term.semester]
    });
    res.json(await Promise.all(r.rows.map(fullSchedule)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/schedules', async (req, res) => {
  try {
    const { instructor_id, subject_id, section, num_students, day_key, timeslot_label, room_id } = req.body;
    if (!instructor_id || !subject_id || !section || !day_key || !timeslot_label || !room_id) {
      return res.status(400).json({ error: 'All fields (instructor, subject, section, day, timeslot, room) are required.' });
    }
    const term = await currentTerm();

    const [instR, subjR, roomR] = await Promise.all([
      db.execute({ sql: `SELECT * FROM instructors WHERE id = ?`, args: [instructor_id] }),
      db.execute({ sql: `SELECT * FROM subjects WHERE id = ?`, args: [subject_id] }),
      db.execute({ sql: `SELECT * FROM rooms WHERE id = ?`, args: [room_id] })
    ]);
    const instructor = instR.rows[0];
    const subject = subjR.rows[0];
    const room = roomR.rows[0];
    if (!instructor) return res.status(404).json({ error: 'Instructor not found.' });
    if (!subject) return res.status(404).json({ error: 'Subject not found.' });
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    const [instMajR, instCanHandleR] = await Promise.all([
      db.execute({ sql: `SELECT major_id FROM instructor_majors WHERE instructor_id = ?`, args: [instructor_id] }),
      db.execute({ sql: `SELECT major_id FROM instructor_can_handle WHERE instructor_id = ?`, args: [instructor_id] })
    ]);
    const instructorMajorIds = [...instMajR.rows.map(r => r.major_id), ...instCanHandleR.rows.map(r => r.major_id)];
    if (!instructorMajorIds.includes(subject.major_id)) {
      return res.status(409).json({ error: `Major mismatch! ${instructor.name} cannot teach this subject's major.` });
    }

    // Conflict checks only look within the SAME semester — the same room/
    // instructor/section can be reused freely across different semesters.
    const sameDayR = await db.execute({
      sql: `SELECT * FROM schedules WHERE day_key = ? AND academic_year = ? AND semester = ?`,
      args: [day_key, term.academic_year, term.semester]
    });
    const sameDayTimeR = { rows: sameDayR.rows.filter(s => timeslotsOverlap(s.timeslot_label, timeslot_label)) };
    for (const s of sameDayTimeR.rows) {
      if (s.room_id === room_id) {
        return res.status(409).json({ error: `Room Conflict! ${room.name} is already used on ${day_key} at ${s.timeslot_label} (overlaps ${timeslot_label}).` });
      }
      if (s.instructor_id === instructor_id) {
        return res.status(409).json({ error: `Instructor Conflict! ${instructor.name} is already scheduled on ${day_key} at ${s.timeslot_label} (overlaps ${timeslot_label}).` });
      }
      if (s.section === section) {
        return res.status(409).json({ error: `Section Conflict! ${section} already has a class on ${day_key} at ${s.timeslot_label} (overlaps ${timeslot_label}).` });
      }
    }

    const info = await db.execute({
      sql: `INSERT INTO schedules (instructor_id, subject_id, section, num_students, day_key, timeslot_label, room_id, academic_year, semester)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [instructor_id, subject_id, section.trim(), num_students ?? 0, day_key, timeslot_label, room_id, term.academic_year, term.semester]
    });
    const r = await db.execute({ sql: `SELECT * FROM schedules WHERE id = ?`, args: [Number(info.lastInsertRowid)] });
    res.status(201).json(await fullSchedule(r.rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/schedules/:id', async (req, res) => {
  try {
    await db.execute({ sql: `DELETE FROM schedules WHERE id = ?`, args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingR = await db.execute({ sql: `SELECT * FROM schedules WHERE id = ?`, args: [id] });
    const existing = existingR.rows[0];
    if (!existing) return res.status(404).json({ error: 'Schedule not found.' });

    const instructor_id  = req.body.instructor_id  ?? existing.instructor_id;
    const subject_id     = req.body.subject_id     ?? existing.subject_id;
    const section        = req.body.section        ?? existing.section;
    const num_students   = req.body.num_students   ?? existing.num_students;
    const day_key        = req.body.day_key        ?? existing.day_key;
    const timeslot_label = req.body.timeslot_label ?? existing.timeslot_label;
    const room_id        = req.body.room_id        ?? existing.room_id;

    const [instR, subjR, roomR] = await Promise.all([
      db.execute({ sql: `SELECT * FROM instructors WHERE id = ?`, args: [instructor_id] }),
      db.execute({ sql: `SELECT * FROM subjects WHERE id = ?`, args: [subject_id] }),
      db.execute({ sql: `SELECT * FROM rooms WHERE id = ?`, args: [room_id] })
    ]);
    const instructor = instR.rows[0];
    const subject = subjR.rows[0];
    const room = roomR.rows[0];
    if (!instructor) return res.status(404).json({ error: 'Instructor not found.' });
    if (!subject)    return res.status(404).json({ error: 'Subject not found.' });
    if (!room)       return res.status(404).json({ error: 'Room not found.' });

    const [instMajR, instCanHandleR] = await Promise.all([
      db.execute({ sql: `SELECT major_id FROM instructor_majors WHERE instructor_id = ?`, args: [instructor_id] }),
      db.execute({ sql: `SELECT major_id FROM instructor_can_handle WHERE instructor_id = ?`, args: [instructor_id] })
    ]);
    const instructorMajorIds = [...instMajR.rows.map(r => r.major_id), ...instCanHandleR.rows.map(r => r.major_id)];
    if (!instructorMajorIds.includes(subject.major_id))
      return res.status(409).json({ error: `Major mismatch! ${instructor.name} cannot teach this subject.` });

    // Stays within the schedule row's own semester (an edit never moves a
    // schedule to a different semester), so conflicts are only checked
    // against schedules from that same semester.
    const sameDayR = await db.execute({
      sql: `SELECT * FROM schedules WHERE day_key = ? AND id != ? AND academic_year = ? AND semester = ?`,
      args: [day_key, id, existing.academic_year, existing.semester]
    });
    const sameDayTimeR = { rows: sameDayR.rows.filter(s => timeslotsOverlap(s.timeslot_label, timeslot_label)) };
    for (const s of sameDayTimeR.rows) {
      if (s.room_id === room_id)
        return res.status(409).json({ error: `Room Conflict! ${room.name} is already used on ${day_key} at ${s.timeslot_label} (overlaps ${timeslot_label}).` });
      if (s.instructor_id === instructor_id)
        return res.status(409).json({ error: `Instructor Conflict! ${instructor.name} is already scheduled at ${s.timeslot_label} (overlaps ${timeslot_label}).` });
      if (s.section === section)
        return res.status(409).json({ error: `Section Conflict! ${section} already has a class at ${s.timeslot_label} (overlaps ${timeslot_label}).` });
    }

    await db.execute({
      sql: `UPDATE schedules SET instructor_id=?,subject_id=?,section=?,num_students=?,day_key=?,timeslot_label=?,room_id=? WHERE id=?`,
      args: [instructor_id, subject_id, section.trim(), num_students, day_key, timeslot_label, room_id, id]
    });
    const r = await db.execute({ sql: `SELECT * FROM schedules WHERE id = ?`, args: [id] });
    res.json(await fullSchedule(r.rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset only clears the schedules of the CURRENTLY selected semester —
// other semesters' saved schedules are untouched.
router.delete('/schedules', async (req, res) => {
  try {
    const term = await currentTerm();
    await db.execute({
      sql: `DELETE FROM schedules WHERE academic_year = ? AND semester = ?`,
      args: [term.academic_year, term.semester]
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Derived view: distinct sections (for Class Program selector) ----------
router.get('/sections', async (req, res) => {
  try {
    const term = await currentTerm();
    const r = await db.execute({
      sql: `SELECT DISTINCT section FROM schedules WHERE academic_year = ? AND semester = ? ORDER BY section`,
      args: [term.academic_year, term.semester]
    });
    res.json(r.rows.map(row => row.section));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
