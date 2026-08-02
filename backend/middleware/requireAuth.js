// Middleware: require an active admin session for all /api routes
// except the auth endpoints themselves (status, setup, login).
const OPEN_ROUTES = [
  '/api/auth/status',
  '/api/auth/setup',
  '/api/auth/login'
];

function requireAuth(req, res, next) {
  // Let non-API requests through (frontend files)
  if (!req.path.startsWith('/api')) return next();
  // Let open auth routes through
  if (OPEN_ROUTES.includes(req.path)) return next();
  // Everything else needs a valid session
  if (req.session && req.session.admin_logged_in) return next();
  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

module.exports = requireAuth;
