/**
 * routes/datasets.js
 * Manages "datasets" — one entry per uploaded/created batch of sales
 * data. Every CSV import creates a brand-new dataset instead of
 * merging into whatever was uploaded before; the dashboard and the
 * Manage Sales page then read from exactly one dataset at a time,
 * chosen from the selector these endpoints back.
 */

const express = require("express");
const db = require("../db/connection");

const router = express.Router();

// Turns "Q1 Report" into a name that doesn't collide with an existing
// dataset, e.g. "Q1 Report (2)", "Q1 Report (3)", ...
function uniquifyName(baseName) {
  const trimmed = (baseName || "").trim() || "Untitled Dataset";
  const exists = db.prepare("SELECT 1 FROM datasets WHERE name = ?");

  if (!exists.get(trimmed)) return trimmed;

  let n = 2;
  while (exists.get(`${trimmed} (${n})`)) n++;
  return `${trimmed} (${n})`;
}

// ---------------- List datasets (for the selector) ----------------
router.get("/api/datasets", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT
           d.id, d.name, d.source_filename, d.created_at,
           COUNT(s.id) AS row_count,
           COALESCE(SUM(s.revenue), 0) AS total_revenue
         FROM datasets d
         LEFT JOIN sales s ON s.dataset_id = d.id
         GROUP BY d.id
         ORDER BY d.created_at DESC, d.id DESC`
      )
      .all();

    res.json({ datasets: rows });
  } catch (err) {
    console.error("GET /api/datasets failed:", err);
    res.status(500).json({ error: "Could not load datasets." });
  }
});

// ---------------- Create an empty dataset ----------------
// Lets a user start a fresh, blank dataset (e.g. to add sales by hand)
// without importing a CSV first.
router.post("/api/datasets", (req, res) => {
  const rawName = (req.body?.name || "").trim();
  if (!rawName) return res.status(400).json({ error: "A dataset name is required." });

  try {
    const name = uniquifyName(rawName);
    const result = db
      .prepare("INSERT INTO datasets (name, source_filename) VALUES (?, ?)")
      .run(name, req.body?.source_filename || null);

    res.status(201).json({
      success: true,
      dataset: { id: result.lastInsertRowid, name, row_count: 0, total_revenue: 0 },
    });
  } catch (err) {
    console.error("POST /api/datasets failed:", err);
    res.status(500).json({ error: "Unable to create dataset." });
  }
});

// ---------------- Rename a dataset ----------------
router.put("/api/datasets/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid dataset id." });
  }

  const rawName = (req.body?.name || "").trim();
  if (!rawName) return res.status(400).json({ error: "A dataset name is required." });

  const existing = db.prepare("SELECT id FROM datasets WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Dataset not found." });

  try {
    const clash = db.prepare("SELECT id FROM datasets WHERE name = ? AND id != ?").get(rawName, id);
    const name = clash ? uniquifyName(rawName) : rawName;

    db.prepare("UPDATE datasets SET name = ? WHERE id = ?").run(name, id);
    res.json({ success: true, dataset: { id, name } });
  } catch (err) {
    console.error("PUT /api/datasets/:id failed:", err);
    res.status(500).json({ error: "Unable to rename dataset." });
  }
});

// ---------------- Delete a dataset (and its sales rows) ----------------
router.delete("/api/datasets/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid dataset id." });
  }

  try {
    const result = db.prepare("DELETE FROM datasets WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: "Dataset not found." });
    // ON DELETE CASCADE (see db/seed.js) removes the dataset's sales rows too.
    res.json({ success: true, message: "Dataset deleted successfully." });
  } catch (err) {
    console.error("DELETE /api/datasets/:id failed:", err);
    res.status(500).json({ error: "Unable to delete dataset." });
  }
});

module.exports = router;
