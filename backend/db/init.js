// ============================================================
// CTE Automated Scheduling System — Database Initialization
// Uses @libsql/client, which works BOTH ways:
//   - Locally: pass a file:./cte.db URL -> behaves like plain SQLite
//   - In production (Render): pass your Turso libsql:// URL + auth
//     token -> data is stored in Turso's cloud SQLite, so it survives
//     Render's free-tier restarts (local disk is NOT persistent there).
// NO sample/built-in instructors, subjects, rooms, or majors are
// seeded here — everything starts EMPTY and is populated only
// through the "Manage Data" tab by the user.
// ============================================================
const { createClient } = require('@libsql/client');
const path = require('path');

const TURSO_URL        = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN  = process.env.TURSO_AUTH_TOKEN;

const db = TURSO_URL
  ? createClient({ url: TURSO_URL, authToken: TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.join(__dirname, 'cte.db')}` });

async function init() {
  if (!TURSO_URL) {
    await db.execute('PRAGMA journal_mode = WAL;');
  }
  await db.execute('PRAGMA foreign_keys = ON;');

  const schema = [
    `CREATE TABLE IF NOT EXISTS admin_account (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      username      TEXT NOT NULL,
      password_hash TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS academic_settings (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      academic_year TEXT NOT NULL DEFAULT '2025-2026',
      semester      TEXT NOT NULL DEFAULT '1st Semester'
    )`,
    // Single global set of signatory names, entered once in Manage Data >
    // Signatories, that auto-fills into every printed Faculty Workload and
    // Class Program document instead of being typed per-document.
    `CREATE TABLE IF NOT EXISTS signatory_settings (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      wl_prepared_by        TEXT NOT NULL DEFAULT '',
      wl_verified_by        TEXT NOT NULL DEFAULT '',
      wl_campus_director    TEXT NOT NULL DEFAULT '',
      wl_dean               TEXT NOT NULL DEFAULT '',
      wl_vp_academic        TEXT NOT NULL DEFAULT '',
      wl_approved_by        TEXT NOT NULL DEFAULT '',
      cp_prepared_by        TEXT NOT NULL DEFAULT '',
      cp_approved_by        TEXT NOT NULL DEFAULT '',
      sc_prepared_by        TEXT NOT NULL DEFAULT '',
      sc_verified_by        TEXT NOT NULL DEFAULT '',
      sc_campus_director    TEXT NOT NULL DEFAULT '',
      sc_vp_academic        TEXT NOT NULL DEFAULT '',
      sc_dean               TEXT NOT NULL DEFAULT '',
      sc_approved_by        TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS majors (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL,
      type  TEXT NOT NULL DEFAULT 'Major'
    )`,
    `CREATE TABLE IF NOT EXISTS rooms (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE
    )`,
    `CREATE TABLE IF NOT EXISTS day_clusters (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      key    TEXT NOT NULL UNIQUE,
      label  TEXT NOT NULL,
      display TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS timeslots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label       TEXT NOT NULL UNIQUE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_lunch_marker INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS instructors (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      name                        TEXT NOT NULL,
      status                      TEXT NOT NULL DEFAULT 'Permanent',
      rank                        TEXT,
      qualification               TEXT,
      years_service               INTEGER DEFAULT 0,
      salary_grade                INTEGER,
      designation                 TEXT,
      designation_units           REAL DEFAULT 0,
      special_assignment          TEXT,
      special_assignment_units    REAL DEFAULT 0,
      designation2                TEXT,
      designation2_units          REAL DEFAULT 0,
      designation3                TEXT,
      designation3_units          REAL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS instructor_majors (
      instructor_id  INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
      major_id       INTEGER NOT NULL REFERENCES majors(id) ON DELETE CASCADE,
      PRIMARY KEY (instructor_id, major_id)
    )`,
    `CREATE TABLE IF NOT EXISTS subjects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL,
      descr      TEXT NOT NULL,
      units      INTEGER NOT NULL,
      major_id   INTEGER NOT NULL REFERENCES majors(id) ON DELETE CASCADE,
      year_level INTEGER NOT NULL DEFAULT 0,
      program    TEXT NOT NULL DEFAULT 'Both',
      is_lab     INTEGER NOT NULL DEFAULT 0,
      semester   TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS schedules (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      instructor_id  INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
      subject_id     INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      section        TEXT NOT NULL,
      num_students   INTEGER NOT NULL DEFAULT 0,
      day_key        TEXT NOT NULL REFERENCES day_clusters(key),
      timeslot_label TEXT NOT NULL REFERENCES timeslots(label),
      room_id        INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      academic_year  TEXT NOT NULL DEFAULT '',
      semester       TEXT NOT NULL DEFAULT ''
    )`
  ];

  for (const stmt of schema) {
    await db.execute(stmt);
  }

  // Migrations for DBs created before certain columns existed.
  try { await db.execute(`ALTER TABLE subjects ADD COLUMN is_lab INTEGER NOT NULL DEFAULT 0`); } catch (e) { /* already exists */ }
  // Semester (1st Semester / 2nd Semester) a subject is normally offered in,
  // so the Assign Schedule course dropdown can filter to the CURRENT
  // semester and stop mixing up which courses belong to which term. Blank
  // = not yet tagged, shows regardless of semester (until an admin sets it).
  try { await db.execute(`ALTER TABLE subjects ADD COLUMN semester TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }

  // One-time (idempotent) backfill: tags each subject's Semester based on
  // the NEMSU Tagbina BEED and BSED-Science curricula, so existing/newly
  // added subjects don't need to be tagged by hand one by one. Only ever
  // touches rows where semester is still blank ('') — an admin's manual
  // edit in Manage Data is never overwritten.
  //
  // Most course codes fall in the same semester in BOTH curricula, so
  // those are matched by code alone (any program). A handful of codes
  // are reused by both programs for DIFFERENT courses offered in
  // DIFFERENT semesters (e.g. Educ 6 is 1st Sem in BSED-Science but 2nd
  // Sem in BEED) — those are matched by code AND program together so
  // the two curricula never cross-contaminate each other.
  try {
    const sem1 = ['GE-US','GE-MMW','GE-PC','Chem 1','Sci 101','Phys A','PathFit 1','NSTP 1',
      'Eng 2','Chem 3','Bio 1','Phys 2','PathFit 3',
      'Bio 2','Phys 4','Phys 5','Sci 104','Sci 105','Res 1','Res. 1','RES 1','Educ 1','Educ 2','Educ 5',
      'FS 1','FS 2','CA 2',
      'English 101','Music','TLE 101','PEH','Filipino 101','GE-Rizal','MTB-MLE','Math 101','SS 101'];
    const sem2 = ['GE-RPH','GE-CW','Eng 1','GE-PEE','Chem 2','Phys 1','PathFit 2','NSTP 2',
      'GE-PPC','Chem 4','Phys 3','Sci 103','Educ 3','Educ 4',
      'Rizal','Res 2','Res. 2','RES 2','Sci 106','Bio 3','Bio 4','Educ 9','Educ 10','CA 1','Educ 11',
      'English 1','TLE 102','Filipino 102','English 102','VED','Elective','Math 102','SS 102','ARTS','TTL'];
    for (const code of sem1) {
      await db.execute({ sql: `UPDATE subjects SET semester='1st Semester' WHERE UPPER(TRIM(code))=UPPER(?) AND semester=''`, args: [code] });
    }
    for (const code of sem2) {
      await db.execute({ sql: `UPDATE subjects SET semester='2nd Semester' WHERE UPPER(TRIM(code))=UPPER(?) AND semester=''`, args: [code] });
    }
    // Codes reused by both curricula for a different course in a different
    // semester — disambiguated by the subject's own Program (BEED/BSED).
    const perProgram = [
      { code:'GE-E',    bsed:'1st Semester', beed:'2nd Semester' },
      { code:'GE-AA',   bsed:'2nd Semester', beed:'1st Semester' },
      { code:'GE-GS',   bsed:'1st Semester', beed:'2nd Semester' },
      { code:'GE-STS',  bsed:'2nd Semester', beed:'1st Semester' },
      { code:'Sci 102', bsed:'1st Semester', beed:'2nd Semester' },
      { code:'Educ 6',  bsed:'1st Semester', beed:'2nd Semester' },
      { code:'Educ 7',  bsed:'2nd Semester', beed:'1st Semester' },
      { code:'Educ 8',  bsed:'2nd Semester', beed:'1st Semester' }
    ];
    for (const p of perProgram) {
      await db.execute({ sql: `UPDATE subjects SET semester=? WHERE UPPER(TRIM(code))=UPPER(?) AND program='BSED' AND semester=''`, args: [p.bsed, p.code] });
      await db.execute({ sql: `UPDATE subjects SET semester=? WHERE UPPER(TRIM(code))=UPPER(?) AND program='BEED' AND semester=''`, args: [p.beed, p.code] });
    }
  } catch (e) { /* best-effort backfill */ }
  try { await db.execute(`ALTER TABLE majors ADD COLUMN type TEXT NOT NULL DEFAULT 'Major'`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN designation TEXT`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN designation_units REAL DEFAULT 0`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN special_assignment TEXT`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN special_assignment_units REAL DEFAULT 0`); } catch (e) { /* already exists */ }
  // 2nd designation reserves units on the PRAISE Load card; 3rd designation
  // reserves units on the Service Credit Load card (see Manage Data > Add Instructor).
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN designation2 TEXT`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN designation2_units REAL DEFAULT 0`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN designation3 TEXT`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN designation3_units REAL DEFAULT 0`); } catch (e) { /* already exists */ }
  // Recommending Approval on the Faculty Workload also needs the VP for
  // Academic Affairs alongside Campus Director and Dean.
  try { await db.execute(`ALTER TABLE signatory_settings ADD COLUMN wl_vp_academic TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  // Service Credit has its own separate, optional signatory set: Department
  // Dean as preparer, 3-way Recommending Approval, President as Approved —
  // distinct from the regular Faculty Workload signatories above.
  try { await db.execute(`ALTER TABLE signatory_settings ADD COLUMN sc_prepared_by TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE signatory_settings ADD COLUMN sc_verified_by TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE signatory_settings ADD COLUMN sc_campus_director TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE signatory_settings ADD COLUMN sc_vp_academic TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE signatory_settings ADD COLUMN sc_dean TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE signatory_settings ADD COLUMN sc_approved_by TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  try {
    await db.execute(`INSERT OR IGNORE INTO academic_settings (id, academic_year, semester) VALUES (1, '2025-2026', '1st Semester')`);
  await db.execute(`INSERT OR IGNORE INTO signatory_settings (id) VALUES (1)`);
  } catch (e) { /* already exists */ }
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS instructor_can_handle (
      instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
      major_id      INTEGER NOT NULL REFERENCES majors(id)      ON DELETE CASCADE,
      PRIMARY KEY (instructor_id, major_id)
    )`);
  } catch (e) { /* already exists */ }

  // Semester scoping for schedules, so creating a new semester's loading
  // never touches/deletes another semester's saved schedules — each
  // schedule row is stamped with the academic_year/semester it was created
  // under, and all schedule queries filter by the CURRENT academic_settings.
  try { await db.execute(`ALTER TABLE schedules ADD COLUMN academic_year TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE schedules ADD COLUMN semester TEXT NOT NULL DEFAULT ''`); } catch (e) { /* already exists */ }
  // Backfill: any pre-existing schedule rows saved before this feature
  // existed (blank academic_year/semester) belong to whatever semester is
  // CURRENTLY set, since that's what they were created under.
  try {
    const cur = await db.execute(`SELECT academic_year, semester FROM academic_settings WHERE id = 1`);
    const row = cur.rows[0];
    if (row) {
      await db.execute({
        sql: `UPDATE schedules SET academic_year = ?, semester = ? WHERE academic_year = '' OR semester = ''`,
        args: [row.academic_year, row.semester]
      });
    }
  } catch (e) { /* best-effort backfill */ }
}

const ready = init();

module.exports = db;
module.exports.ready = ready;
