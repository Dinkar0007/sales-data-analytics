/**
 * routes/sales.js
 * Full CRUD for individual sales records, plus CSV import (preview +
 * confirm) and CSV export. This is the "Sales Data Management" layer
 * that sits alongside the existing read-only dashboard analytics in
 * routes/dashboard.js.
 *
 * All routes here are mounted under /api and are protected by the
 * existing requireAuth middleware in server.js (same as every other
 * /api/* route).
 */

const express = require("express");
const multer = require("multer");
const { parse } = require("csv-parse/sync");

const db = require("../db/connection");
const buildFilters = require("./buildFilters");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB CSV cap

// Columns a client is allowed to sort by — whitelisted because column
// names can't be parameterized, so we never interpolate raw user input here.
const SORT_COLUMNS = {
  date: "s.sale_date",
  product: "p.product_name",
  category: "p.category",
  region: "r.region_name",
  quantity: "s.quantity",
  unit_price: "s.unit_price",
  revenue: "s.revenue",
  profit: "s.profit",
};

// ---------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------
// A sale always belongs to exactly one dataset. On create, the client
// sends the dataset currently selected in the UI; edits keep whatever
// dataset the row already belonged to (see PUT handler below).
function validateDatasetId(body) {
  const datasetId = Number(body.dataset_id);
  if (!Number.isInteger(datasetId) || datasetId <= 0) {
    return { error: "Select a dataset before adding a sale." };
  }
  const exists = db.prepare("SELECT id FROM datasets WHERE id = ?").get(datasetId);
  if (!exists) return { error: "Selected dataset does not exist." };
  return { datasetId };
}

function validateSalePayload(body, { partial = false } = {}) {
  const errors = [];
  const clean = {};

  const need = (key) => !partial || body[key] !== undefined;

  if (need("product_id")) {
    const productId = Number(body.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      errors.push("A valid product must be selected.");
    } else {
      const exists = db.prepare("SELECT id FROM products WHERE id = ?").get(productId);
      if (!exists) errors.push("Selected product does not exist.");
      else clean.product_id = productId;
    }
  }

  if (need("region_id")) {
    const regionId = Number(body.region_id);
    if (!Number.isInteger(regionId) || regionId <= 0) {
      errors.push("A valid region must be selected.");
    } else {
      const exists = db.prepare("SELECT id FROM regions WHERE id = ?").get(regionId);
      if (!exists) errors.push("Selected region does not exist.");
      else clean.region_id = regionId;
    }
  }

  if (need("sale_date")) {
    const d = String(body.sale_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(new Date(d).getTime())) {
      errors.push("Date must be a valid date (YYYY-MM-DD).");
    } else {
      clean.sale_date = d;
    }
  }

  if (need("quantity")) {
    const qty = Number(body.quantity);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      errors.push("Quantity must be a positive whole number.");
    } else {
      clean.quantity = qty;
    }
  }

  if (need("unit_price")) {
    const price = Number(body.unit_price);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push("Unit price must be a positive number.");
    } else {
      clean.unit_price = price;
    }
  }

  // Profit is optional — if omitted we default to a 20% margin on revenue.
  if (body.profit !== undefined && body.profit !== null && body.profit !== "") {
    const profit = Number(body.profit);
    if (!Number.isFinite(profit) || profit < 0) {
      errors.push("Profit must be a non-negative number.");
    } else {
      clean.profit = profit;
    }
  }

  return { errors, clean };
}

function computeRevenue(quantity, unitPrice) {
  return Math.round(quantity * unitPrice * 100) / 100;
}

function defaultProfit(revenue) {
  return Math.round(revenue * 0.2 * 100) / 100; // 20% assumed margin when not specified
}

// ---------------------------------------------------------------------
// GET /api/sales — list with search, filters, sorting, pagination
// ---------------------------------------------------------------------
router.get("/api/sales", (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 10));
    const offset = (page - 1) * perPage;

    const sortKey = SORT_COLUMNS[req.query.sort_by] ? req.query.sort_by : "date";
    const sortCol = SORT_COLUMNS[sortKey];
    const sortDir = String(req.query.sort_dir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const total = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM sales s
         JOIN products p ON p.id = s.product_id
         JOIN regions r ON r.id = s.region_id
         ${where}`
      )
      .get(params).total;

    const rows = db
      .prepare(
        `SELECT
           s.id, s.sale_date, s.product_id, p.product_name, p.category,
           s.region_id, r.region_name, s.quantity, s.unit_price, s.revenue, s.profit,
           s.dataset_id, d.name AS dataset_name
         FROM sales s
         JOIN products p ON p.id = s.product_id
         JOIN regions r ON r.id = s.region_id
         LEFT JOIN datasets d ON d.id = s.dataset_id
         ${where}
         ORDER BY ${sortCol} ${sortDir}, s.id DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: perPage, offset });

    res.json({
      rows,
      page,
      per_page: perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / perPage)),
      sort_by: sortKey,
      sort_dir: sortDir.toLowerCase(),
    });
  } catch (err) {
    console.error("GET /api/sales failed:", err);
    res.status(500).json({ error: "Could not load sales records." });
  }
});

// ---------------------------------------------------------------------
// GET /api/sales/export — download CSV (respects active filters)
// IMPORTANT: this must be registered BEFORE GET /api/sales/:id, otherwise
// Express would match "export" as the :id parameter and return a 400.
// ---------------------------------------------------------------------
router.get("/api/sales/export", (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);

    const rows = db
      .prepare(
        `SELECT
           s.id, s.sale_date, p.product_name, p.category, r.region_name,
           s.quantity, s.unit_price, s.revenue, s.profit
         FROM sales s
         JOIN products p ON p.id = s.product_id
         JOIN regions r ON r.id = s.region_id
         ${where}
         ORDER BY s.sale_date DESC, s.id DESC`
      )
      .all(params);

    const header = "ID,Date,Product,Category,Region,Quantity,UnitPrice,Revenue,Profit";
    const csvEscape = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((r) =>
      [r.id, r.sale_date, r.product_name, r.category, r.region_name, r.quantity, r.unit_price, r.revenue, r.profit]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header, ...lines].join("\n");

    const filename = `sales_export_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("GET /api/sales/export failed:", err);
    res.status(500).json({ error: "Unable to export data." });
  }
});

// ---------------------------------------------------------------------
// GET /api/sales/datasets — list every uploaded dataset (plus the
// original sample data) so the UI can show each upload as its own
// separate entry instead of one merged pool of records.
// IMPORTANT: must be registered BEFORE GET /api/sales/:id, same reason
// as /api/sales/export above.
// ---------------------------------------------------------------------
router.get("/api/sales/datasets", (req, res) => {
  try {
    const datasets = db
      .prepare(
        `SELECT d.id, d.name, d.uploaded_at, COUNT(s.id) AS row_count
         FROM datasets d
         LEFT JOIN sales s ON s.dataset_id = d.id
         GROUP BY d.id
         ORDER BY d.uploaded_at DESC, d.id DESC`
      )
      .all();

    const unassigned = db.prepare("SELECT COUNT(*) AS n FROM sales WHERE dataset_id IS NULL").get().n;

    res.json({ datasets, unassigned_count: unassigned });
  } catch (err) {
    console.error("GET /api/sales/datasets failed:", err);
    res.status(500).json({ error: "Could not load datasets." });
  }
});

// ---------------------------------------------------------------------
// GET /api/sales/:id — full detail for the View modal
// ---------------------------------------------------------------------
router.get("/api/sales/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid sale id." });
  }

  const row = db
    .prepare(
      `SELECT
         s.id, s.sale_date, s.product_id, p.product_name, p.category,
         s.region_id, r.region_name, s.quantity, s.unit_price, s.revenue, s.profit
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN regions r ON r.id = s.region_id
       WHERE s.id = ?`
    )
    .get(id);

  if (!row) return res.status(404).json({ error: "Sale not found." });
  res.json(row);
});

// ---------------------------------------------------------------------
// POST /api/sales — create
// ---------------------------------------------------------------------
router.post("/api/sales", (req, res) => {
  const { error: datasetError, datasetId } = validateDatasetId(req.body || {});
  if (datasetError) return res.status(400).json({ error: datasetError });

  const { errors, clean } = validateSalePayload(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  try {
    const revenue = computeRevenue(clean.quantity, clean.unit_price);
    const profit = clean.profit !== undefined ? clean.profit : defaultProfit(revenue);

    const result = db
      .prepare(
        `INSERT INTO sales (dataset_id, product_id, region_id, sale_date, quantity, unit_price, revenue, profit)
         VALUES (@dataset_id, @product_id, @region_id, @sale_date, @quantity, @unit_price, @revenue, @profit)`
      )
      .run({ ...clean, dataset_id: datasetId, revenue, profit });

    res.status(201).json({ success: true, id: result.lastInsertRowid, message: "Sale added successfully." });
  } catch (err) {
    console.error("POST /api/sales failed:", err);
    res.status(500).json({ error: "Unable to add sale." });
  }
});

// ---------------------------------------------------------------------
// PUT /api/sales/:id — update
// ---------------------------------------------------------------------
router.put("/api/sales/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid sale id." });
  }

  const existing = db.prepare("SELECT * FROM sales WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Sale not found." });

  const { errors, clean } = validateSalePayload(req.body || {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const merged = { ...existing, ...clean };
  const revenue = computeRevenue(merged.quantity, merged.unit_price);
  const profit = clean.profit !== undefined ? clean.profit : merged.profit;

  try {
    // dataset_id is intentionally NOT updated here — editing a sale
    // never moves it into a different dataset.
    db.prepare(
      `UPDATE sales
       SET product_id = @product_id, region_id = @region_id, sale_date = @sale_date,
           quantity = @quantity, unit_price = @unit_price, revenue = @revenue, profit = @profit
       WHERE id = @id`
    ).run({ ...merged, revenue, profit, id });

    res.json({ success: true, message: "Sale updated successfully." });
  } catch (err) {
    console.error("PUT /api/sales/:id failed:", err);
    res.status(500).json({ error: "Unable to update sale." });
  }
});

// ---------------------------------------------------------------------
// DELETE /api/sales/:id
// ---------------------------------------------------------------------
router.delete("/api/sales/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid sale id." });
  }

  try {
    const result = db.prepare("DELETE FROM sales WHERE id = ?").run(id);
    if (result.changes === 0) return res.status(404).json({ error: "Sale not found." });
    res.json({ success: true, message: "Sale deleted successfully." });
  } catch (err) {
    console.error("DELETE /api/sales/:id failed:", err);
    res.status(500).json({ error: "Unable to delete sale." });
  }
});

// ---------------------------------------------------------------------
// CSV IMPORT — step 1: preview (parse + validate, no DB writes)
// ---------------------------------------------------------------------
// Expected header: Date,Product,Category,Region,Quantity,UnitPrice[,Profit]
router.post("/api/sales/import/preview", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No CSV file was uploaded." });

  let records;
  try {
    records = parse(req.file.buffer.toString("utf-8"), {
      columns: (header) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    return res.status(400).json({ error: "Invalid CSV format. Please check the file structure." });
  }

  if (!records.length) {
    return res.status(400).json({ error: "The CSV file has no data rows." });
  }

  const valid = [];
  const invalid = [];

  records.forEach((row, index) => {
    const rowNum = index + 2; // +1 for header row, +1 for 1-based counting
    const rowErrors = [];

    const date = (row.date || "").trim();
    const productName = (row.product || "").trim();
    const category = (row.category || "").trim();
    const regionName = (row.region || "").trim();
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unitprice);
    const profitRaw = row.profit !== undefined && row.profit !== "" ? Number(row.profit) : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
      rowErrors.push("invalid date");
    }
    if (!productName) rowErrors.push("missing product");
    if (!category) rowErrors.push("missing category");
    if (!regionName) rowErrors.push("missing region");
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      rowErrors.push("invalid quantity");
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) rowErrors.push("invalid unit price");
    if (profitRaw !== null && (!Number.isFinite(profitRaw) || profitRaw < 0)) rowErrors.push("invalid profit");

    if (rowErrors.length) {
      invalid.push({ row: rowNum, data: row, errors: rowErrors });
    } else {
      const revenue = computeRevenue(quantity, unitPrice);
      valid.push({
        row: rowNum,
        sale_date: date,
        product_name: productName,
        category,
        region_name: regionName,
        quantity,
        unit_price: unitPrice,
        revenue,
        profit: profitRaw !== null ? profitRaw : defaultProfit(revenue),
      });
    }
  });

  res.json({
    total_rows: records.length,
    valid_count: valid.length,
    invalid_count: invalid.length,
    valid_rows: valid,
    invalid_rows: invalid,
  });
});

// ---------------------------------------------------------------------
// CSV IMPORT — step 2: confirm (insert the previously-validated rows)
//
// Every confirmed import creates a BRAND-NEW dataset and inserts all
// rows against it. Nothing is ever appended to a previously uploaded
// dataset — that's what keeps uploads separate instead of merging
// into one growing pile of sales.
// ---------------------------------------------------------------------
function uniquifyDatasetName(baseName) {
  const trimmed = (baseName || "").trim() || "Untitled Dataset";
  const exists = db.prepare("SELECT 1 FROM datasets WHERE name = ?");

  if (!exists.get(trimmed)) return trimmed;

  let n = 2;
  while (exists.get(`${trimmed} (${n})`)) n++;
  return `${trimmed} (${n})`;
}

router.post("/api/sales/import/confirm", (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || !rows.length) {
    return res.status(400).json({ error: "No valid rows were provided to import." });
  }

  const requestedName = (req.body?.dataset_name || "").trim();
  if (!requestedName) {
    return res.status(400).json({ error: "A name for this dataset is required." });
  }
  const sourceFilename = req.body?.source_filename ? String(req.body.source_filename) : null;

  const findProduct = db.prepare("SELECT id FROM products WHERE LOWER(product_name) = LOWER(?)");
  const insertProduct = db.prepare("INSERT INTO products (product_name, category, unit_price) VALUES (?, ?, ?)");
  const findRegion = db.prepare("SELECT id FROM regions WHERE LOWER(region_name) = LOWER(?)");
  const insertRegion = db.prepare("INSERT INTO regions (region_name) VALUES (?)");
  const insertDataset = db.prepare("INSERT INTO datasets (name, source_filename, row_count) VALUES (?, ?, ?)");
  const insertSale = db.prepare(
    `INSERT INTO sales (dataset_id, product_id, region_id, sale_date, quantity, unit_price, revenue, profit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let inserted = 0;
  let datasetId = null;
  let datasetName = null;
  const failures = [];

  const runImport = db.transaction((rowsToImport) => {
    datasetName = uniquifyDatasetName(requestedName);
    const datasetResult = insertDataset.run(datasetName, sourceFilename, 0);
    datasetId = datasetResult.lastInsertRowid;

    for (const r of rowsToImport) {
      try {
        let product = findProduct.get(r.product_name);
        if (!product) {
          const result = insertProduct.run(r.product_name, r.category, r.unit_price);
          product = { id: result.lastInsertRowid };
        }

        let region = findRegion.get(r.region_name);
        if (!region) {
          const result = insertRegion.run(r.region_name);
          region = { id: result.lastInsertRowid };
        }

        insertSale.run(datasetId, product.id, region.id, r.sale_date, r.quantity, r.unit_price, r.revenue, r.profit);
        inserted++;
      } catch (err) {
        failures.push({ row: r.row, error: "Could not insert this row." });
      }
    }

    db.prepare("UPDATE datasets SET row_count = ? WHERE id = ?").run(inserted, datasetId);
  });

  try {
    runImport(rows);
    res.json({
      success: true,
      inserted,
      failed: failures.length,
      failures,
      dataset: { id: datasetId, name: datasetName },
      message: `${inserted} record${inserted === 1 ? "" : "s"} imported into "${datasetName}".`,
    });
  } catch (err) {
    console.error("POST /api/sales/import/confirm failed:", err);
    res.status(500).json({ error: "Import failed. No records were saved." });
  }
});

module.exports = router;
