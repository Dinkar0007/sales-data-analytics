/**
 * routes/auth.js
 * Login, logout, and "who am I" endpoints.
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/connection");

const router = express.Router();

router.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const user = db
    .prepare("SELECT id, full_name, username, password FROM users WHERE username = ?")
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  req.session.userId = user.id;
  req.session.userName = user.full_name;

  res.json({ success: true, name: user.full_name });
});

router.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get("/api/me", (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ authenticated: true, name: req.session.userName });
  }
  res.json({ authenticated: false });
});

module.exports = router;
