/**
 * middleware/requireAuth.js
 * Protects page and API routes. Pages get redirected to /login,
 * API calls get a clean 401 JSON response instead of a redirect.
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }

  if (req.originalUrl.startsWith("/api/")) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  return res.redirect("/login.html");
}

module.exports = requireAuth;
