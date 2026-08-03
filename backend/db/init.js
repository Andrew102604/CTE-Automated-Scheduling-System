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
      special_assignment_units    REAL DEFAULT 0
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
      is_lab     INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS schedules (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      instructor_id  INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
      subject_id     INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      section        TEXT NOT NULL,
      num_students   INTEGER NOT NULL DEFAULT 0,
      day_key        TEXT NOT NULL REFERENCES day_clusters(key),
      timeslot_label TEXT NOT NULL REFERENCES timeslots(label),
      room_id        INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE
    )`
  ];

  for (const stmt of schema) {
    await db.execute(stmt);
  }

  // Migrations for DBs created before certain columns existed.
  try { await db.execute(`ALTER TABLE subjects ADD COLUMN is_lab INTEGER NOT NULL DEFAULT 0`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE majors ADD COLUMN type TEXT NOT NULL DEFAULT 'Major'`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN designation TEXT`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN designation_units REAL DEFAULT 0`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN special_assignment TEXT`); } catch (e) { /* already exists */ }
  try { await db.execute(`ALTER TABLE instructors ADD COLUMN special_assignment_units REAL DEFAULT 0`); } catch (e) { /* already exists */ }
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS instructor_can_handle (
      instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
      major_id      INTEGER NOT NULL REFERENCES majors(id)      ON DELETE CASCADE,
      PRIMARY KEY (instructor_id, major_id)
    )`);
  } catch (e) { /* already exists */ }
}

const ready = init();

module.exports = db;
module.exports.ready = ready;
