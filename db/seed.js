/**
 * db/seed.js
 * Creates the SQLite database file, defines the schema, and fills it
 * with realistic sample sales data so the dashboard has something
 * meaningful to show right after setup.
 *
 * Run with:  npm run seed
 */

const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "sales_dashboard.db");
const db = new Database(DB_PATH);

console.log("Building schema...");

db.exec(`
  DROP TABLE IF EXISTS sales;
  DROP TABLE IF EXISTS datasets;
  DROP TABLE IF EXISTS products;
  DROP TABLE IF EXISTS regions;
  DROP TABLE IF EXISTS users;

  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit_price REAL NOT NULL
  );

  CREATE TABLE regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    region_name TEXT NOT NULL
  );

  -- Every CSV upload (or manually created batch) becomes its own dataset.
  -- Uploads never merge into an existing dataset's rows; each upload gets
  -- a fresh row here and its own set of "sales" rows tied to it.
  CREATE TABLE datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    source_filename TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    sale_date TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    revenue REAL NOT NULL,
    profit REAL NOT NULL,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (region_id) REFERENCES regions(id)
  );

  CREATE INDEX idx_sale_date ON sales(sale_date);
  CREATE INDEX idx_sale_dataset ON sales(dataset_id);
`);

// ---------------- Seed admin user ----------------
console.log("Creating admin user...");
const passwordHash = bcrypt.hashSync("admin123", 10);
db.prepare(
  "INSERT INTO users (full_name, username, password) VALUES (?, ?, ?)"
).run("Dinkar Mishra", "admin", passwordHash);

// ---------------- Seed products ----------------
const products = [
  ["Wireless Mouse", "Electronics", 799],
  ["Mechanical Keyboard", "Electronics", 2499],
  ["USB-C Hub", "Electronics", 1299],
  ["Office Chair", "Furniture", 6999],
  ["Standing Desk", "Furniture", 12999],
  ["Notebook Set", "Stationery", 249],
  ["Whiteboard Marker Pack", "Stationery", 199],
  ["LED Desk Lamp", "Electronics", 1599],
  ["Bluetooth Speaker", "Electronics", 1899],
  ["Backpack", "Accessories", 1499],
  ["Water Bottle", "Accessories", 399],
  ["Monitor Stand", "Furniture", 1099],
];

console.log(`Inserting ${products.length} products...`);
const insertProduct = db.prepare(
  "INSERT INTO products (product_name, category, unit_price) VALUES (?, ?, ?)"
);
products.forEach((p) => insertProduct.run(...p));

// ---------------- Seed regions ----------------
const regions = ["North", "South", "East", "West", "Central"];
console.log(`Inserting ${regions.length} regions...`);
const insertRegion = db.prepare("INSERT INTO regions (region_name) VALUES (?)");
regions.forEach((r) => insertRegion.run(r));

// ---------------- Seed the default dataset ----------------
// The sample data ships as its own dataset, just like any future CSV
// upload would. Nothing is ever merged into it automatically.
console.log("Creating default dataset...");
const defaultDataset = db
  .prepare("INSERT INTO datasets (name, source_filename) VALUES (?, ?)")
  .run("Sample Sales Data", null);
const defaultDatasetId = defaultDataset.lastInsertRowid;

// ---------------- Seed sales (last 12 months) ----------------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

const insertSale = db.prepare(`
  INSERT INTO sales (dataset_id, product_id, region_id, sale_date, quantity, unit_price, revenue, profit)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const startYear = 2025;
const startMonth = 8; // August 2025 -> rolls forward 12 months
let salesCount = 0;

const insertAllSales = db.transaction(() => {
  for (let m = 0; m < 12; m++) {
    const year = startYear + Math.floor((startMonth - 1 + m) / 12);
    const month = ((startMonth - 1 + m) % 12) + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    let seasonal = 1.0;
    if (month === 11 || month === 12) seasonal = 1.6;
    if (month === 1) seasonal = 1.3;
    if (month === 6 || month === 7) seasonal = 0.8;

    const numOrders = Math.round(randInt(18, 26) * seasonal);

    for (let o = 0; o < numOrders; o++) {
      const day = randInt(1, daysInMonth);
      const dateStr = `${year}-${pad(month)}-${pad(day)}`;
      const productIdx = randInt(1, products.length);
      const [, , unitPrice] = products[productIdx - 1];
      const regionIdx = randInt(1, regions.length);
      const qty = randInt(1, 6);
      const revenue = qty * unitPrice;
      const marginPct = randInt(12, 30) / 100;
      const profit = Math.round(revenue * marginPct);

      insertSale.run(defaultDatasetId, productIdx, regionIdx, dateStr, qty, unitPrice, revenue, profit);
      salesCount++;
    }
  }
});

console.log("Generating sample sales records...");
insertAllSales();
console.log(`Inserted ${salesCount} sales records.`);

db.close();
console.log("\nDone! Database created at db/sales_dashboard.db");
console.log("Login with  username: admin  |  password: admin123");
