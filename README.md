# CTE Automated Scheduling System

A web-based faculty scheduling system for the College of Teacher Education (CTE) with a **Node.js + Express + SQLite backend** and a browser frontend. Replaces the old single-file/localStorage version with real persistent storage that can be deployed online and shared across devices/users.

## What changed from the old version

- **No more hardcoded instructors, subjects, rooms, or majors.** The system starts completely empty. Everything (instructors, their info, subjects, rooms, majors, day clusters, time slots) is added through the **Manage Data** tab and saved to a real database.
- **Real backend + database** (SQLite file `cte.db`) instead of browser `localStorage`. Data persists on the server and is the same for everyone who opens the app — not just one browser on one device.
- All the original features are kept: room-primary timetable grid, conflict detection (room/instructor/section), instructor↔subject major matching, auto-generated Class Program and Faculty Workload documents, and print formatting (landscape timetable, portrait documents).
- Day Clusters (e.g. MTh/TW) and Time Slots are now also editable in Manage Data, in case schedules ever need a 3rd day cluster or extra time slots.

## Project structure

```
cte-scheduling-system/
├── backend/
│   ├── server.js          # Express app entry point
│   ├── package.json
│   ├── db/
│   │   ├── init.js        # DB schema + structural defaults (day clusters/timeslots only)
│   │   └── cte.db       # created automatically on first run (not in git)
│   └── routes/
│       ├── lookups.js      # majors, rooms, day clusters, timeslots
│       ├── instructors.js
│       ├── subjects.js
│       └── schedules.js
└── frontend/
    ├── index.html
    └── app.js
```

## Running it locally

Requires **Node.js 22.5 or newer** (uses the built-in `node:sqlite` module — no native compiling, no extra database install needed).

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:3000** in your browser. That's it — no separate database server, no `.env` file needed for local use.

The database file `backend/db/cte.db` is created automatically the first time you run it. To start completely fresh, just stop the server and delete that file (and the `.db-wal` / `.db-shm` files next to it if present).

You can also point the database to a different location with the `DB_PATH` environment variable (used for online deployment, see below) — e.g. `DB_PATH=/some/path/cte.db npm start`. If `DB_PATH` isn't set, it defaults to `backend/db/cte.db`.

## First-time use

When you first open the app, every list is empty. Go to the **Manage Data** tab and add things in this order, since later steps depend on earlier ones:

1. **Majors** (e.g. Math, English, Professional Education) — needed before adding instructors or subjects
2. **Rooms** (e.g. Room 1, Room 2)
3. **Instructors** — pick which Majors each one can teach
4. **Subjects** — each subject belongs to one Major
5. *(Day Clusters and Time Slots already come with sensible defaults — MTh/TW and the standard school-day hours — but you can edit or add more anytime.)*

Once you have at least one instructor, subject, room, and major, the **Assign Schedule** sidebar on the Timetable tab unlocks.

## Deploying online (Railway — recommended)

Because Render's free tier cannot keep a persistent disk (your database would get wiped on every restart/redeploy), **Railway's Hobby plan (~$5/month)** is the practical choice if you want the data to actually stay saved. This requires a credit card on file.

### Step-by-step

1. **Push this project to GitHub** first (private repo is fine).

2. **Sign up at https://railway.com** (you can sign in with your GitHub account directly).

3. **New Project → Deploy from GitHub repo** → select your `cte-scheduling-system` repo.

4. Railway will create a service and try to build automatically. Open the service's **Settings** tab and set:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

5. **Add a persistent volume** (this is the step that makes your data survive restarts/redeploys):
   - In the service, go to the **Settings** tab → scroll to **Volumes** → **Add Volume**
   - Mount path: `/data`
   - Click **Add**

6. **Set the DB_PATH environment variable** so the app writes its database file inside that volume instead of its normal (non-persistent) folder:
   - Go to the **Variables** tab of the service
   - Add a new variable: `DB_PATH` = `/data/cte.db`
   - Railway will redeploy automatically after you save

7. **Generate a public URL:**
   - Go to **Settings** → **Networking** → **Generate Domain**
   - You'll get a link like `cte-scheduling-system.up.railway.app` — this is what you share with the school (registrar, dean, department chairs, etc.)

8. Open that link in a browser to confirm it loads. It will start completely empty — go to **Manage Data** and set up Majors → Rooms → Instructors → Subjects, same as running it locally.

### After this, updates are simple
Any time you want to push a code change: commit and push to GitHub (or upload changed files there), and Railway automatically rebuilds and redeploys within a minute or two. Your data in the `/data` volume is untouched by this — only the app code changes.

### If you'd rather not pay anything
The alternative is hosting it on a school computer over the local network (LAN) instead of the public internet. This needs no monthly fee, but only works while that computer is on and only for devices connected to the same school network/WiFi — it won't be reachable from outside campus or if the host computer is off. Ask if you want the LAN setup instead; it uses the exact same code, just run with `npm start` on a school PC that stays on, with other devices on the same network opening `http://<that PC's local IP>:3000`.



## Notes on the conflict rules (unchanged from before)

A schedule is rejected if:
- The same **room** is already used at that day + time slot, or
- The same **instructor** is already teaching at that day + time slot, or
- The same **section** already has a class at that day + time slot, or
- The instructor's majors don't include the subject's major (major mismatch)

Faculty Workload classification (Regular ≤18 units / Overload ≤9 / Emergency ≤3 / Praise ≤6) is also unchanged.
