// TODO: this assumes passport session auth (see auth/googleStrategy.js).
// Refuses anything not logged in via Google.
export function requireAuth(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}
