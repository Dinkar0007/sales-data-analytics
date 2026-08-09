/**
 * server.js
 * Sales Data Analytics Dashboard — Node.js + Express + SQLite
 *
 * Run:  npm install   (first time only)
 *       npm run seed  (first time only, creates the database)
 *       npm start
 * Then open http://localhost:3000
 */

const path = require("path");
const express = require("express");
const session = require("express-session");

const requireAuth = require("./middleware/requireAuth");
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const salesRoutes = require("./routes/sales");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "sales-dashboard-dev-secret", // fine for a local student project
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
  })
);

// Public auth endpoints (login must be reachable without a session)
app.use(authRoutes);

// Everything under /api (except the ones above) requires login
app.use("/api", requireAuth);
app.use(dashboardRoutes);
app.use(salesRoutes);

// Multer (CSV upload) errors land here with a clean JSON message instead
// of a raw stack trace, e.g. file too large or wrong field name.
app.use((err, req, res, next) => {
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  next(err);
});

// Serve the login page without auth, then guard the dashboard pages
app.get("/login.html", (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/sales.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "sales.html"));
});

// Static assets (css/js) — served after the guarded routes above
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`\nSales Data Analytics Dashboard running at http://localhost:${PORT}`);
  console.log(`Login with  username: admin  |  password: admin123\n`);
});
