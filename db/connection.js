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

module.exports = db;
