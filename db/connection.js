/**
 * db/connection.js
 * Opens (or creates) the SQLite database file and exports a single
 * shared connection used by every route.
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "sales_dashboard.db");

if (!fs.existsSync(DB_PATH)) {
  console.error(
    "\nDatabase not found. Run `npm run seed` first to create it, then start the server again.\n"
  );
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
// Needed so that deleting a dataset also removes its sales rows
// (ON DELETE CASCADE on sales.dataset_id) instead of orphaning them.
db.pragma("foreign_keys = ON");

/**
 * Lightweight, idempotent migration.
 *
 * Older databases (created before dataset separation was added) don't
 * have a `datasets` table or a `sales.dataset_id` column. Rather than
 * requiring everyone to re-run `npm run seed` (which would wipe their
 * data), we bring any existing database up to date automatically on
 * every boot. Running this against an already-migrated database is a
 * harmless no-op.
 */
function ensureDatasetSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_filename TEXT,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      row_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  const datasetColumns = db.prepare("PRAGMA table_info(datasets)").all();
  const hasSourceFilename = datasetColumns.some((c) => c.name === "source_filename");
  if (!hasSourceFilename) {
    db.exec("ALTER TABLE datasets ADD COLUMN source_filename TEXT");
  }

  const salesColumns = db.prepare("PRAGMA table_info(sales)").all();
  const hasDatasetId = salesColumns.some((c) => c.name === "dataset_id");
  if (!hasDatasetId) {
    db.exec("ALTER TABLE sales ADD COLUMN dataset_id INTEGER REFERENCES datasets(id)");
  }

  // Backfill: any pre-existing sales rows that don't belong to a dataset
  // yet (e.g. the original seed data, or rows imported before this
  // feature existed) get grouped into a single "Original Data" dataset
  // so nothing disappears from view and every row still belongs to
  // exactly one dataset entry.
  const untagged = db.prepare("SELECT COUNT(*) AS n FROM sales WHERE dataset_id IS NULL").get().n;
  if (untagged > 0) {
    const existing = db.prepare("SELECT id FROM datasets WHERE name = ?").get("Original Data");
    const datasetId = existing
      ? existing.id
      : db.prepare("INSERT INTO datasets (name, row_count) VALUES (?, ?)").run("Original Data", untagged)
          .lastInsertRowid;
    db.prepare("UPDATE sales SET dataset_id = ? WHERE dataset_id IS NULL").run(datasetId);
    db.prepare("UPDATE datasets SET row_count = (SELECT COUNT(*) FROM sales WHERE dataset_id = ?) WHERE id = ?").run(
      datasetId,
      datasetId
    );
  }
}

ensureDatasetSchema();

module.exports = db;
