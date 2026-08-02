const express = require('express');
const session = require('express-session');
const path    = require('path');

const db = require('./db/init');

const app  = express();
const PORT = process.env.PORT || 3000;

const SESSION_SECRET = process.env.SESSION_SECRET || 'cte-scheduling-dev-secret-2025';

app.use(express.json());

app.use(session({
  secret:            SESSION_SECRET,
  resave:            true,
  saveUninitialized: true,
  rolling:           true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure:   false,
    maxAge:   8 * 60 * 60 * 1000
  }
}));

app.use(require('./middleware/requireAuth'));

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/lookups'));
app.use('/api', require('./routes/instructors'));
app.use('/api', require('./routes/subjects'));
app.use('/api', require('./routes/schedules'));

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

db.ready
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CTE Automated Scheduling System running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
