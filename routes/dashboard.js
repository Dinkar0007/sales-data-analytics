/**
 * routes/dashboard.js
 * All the data endpoints the dashboard's front-end JS calls:
 * KPI summary, trend chart, top products, region breakdown,
 * the paginated sales table, and filter dropdown options.
 */

const express = require("express");
const db = require("../db/connection");
const buildFilters = require("./buildFilters");

const router = express.Router();

// ---------------- KPI summary ----------------
router.get("/api/summary", (req, res) => {
  const { where, params } = buildFilters(req.query);

  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(s.revenue), 0)  AS total_revenue,
         COALESCE(SUM(s.profit), 0)   AS total_profit,
         COALESCE(COUNT(*), 0)        AS total_orders,
         COALESCE(SUM(s.quantity), 0) AS total_units
       FROM sales s
       JOIN products p ON p.id = s.product_id
       ${where}`
    )
    .get(params);

  const totalOrders = row.total_orders || 0;
  const avgOrderValue = totalOrders > 0 ? Math.round((row.total_revenue / totalOrders) * 100) / 100 : 0;

  res.json({
    total_revenue: row.total_revenue,
    total_profit: row.total_profit,
    total_orders: totalOrders,
    total_units: row.total_units,
    avg_order_value: avgOrderValue,
  });
});

// ---------------- Revenue & profit trend (monthly) ----------------
router.get("/api/sales-by-date", (req, res) => {
  const { where, params } = buildFilters(req.query);

  const rows = db
    .prepare(
      `SELECT
         strftime('%Y-%m', s.sale_date) AS period,
         SUM(s.revenue) AS revenue,
         SUM(s.profit)  AS profit
       FROM sales s
       JOIN products p ON p.id = s.product_id
       ${where}
       GROUP BY period
       ORDER BY period ASC`
    )
    .all(params);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  res.json({
    labels: rows.map((r) => {
      const [y, m] = r.period.split("-");
      return `${monthNames[Number(m) - 1]} ${y}`;
    }),
    revenue: rows.map((r) => r.revenue),
    profit: rows.map((r) => r.profit),
  });
});

// ---------------- Top products ----------------
router.get("/api/sales-by-product", (req, res) => {
  const { where, params } = buildFilters(req.query);

  const rows = db
    .prepare(
      `SELECT
         p.product_name,
         SUM(s.revenue) AS revenue,
         SUM(s.quantity) AS units
       FROM sales s
       JOIN products p ON p.id = s.product_id
       ${where}
       GROUP BY p.id, p.product_name
       ORDER BY revenue DESC
       LIMIT 8`
    )
    .all(params);

  res.json({
    labels: rows.map((r) => r.product_name),
    revenue: rows.map((r) => r.revenue),
    units: rows.map((r) => r.units),
  });
});

// ---------------- Sales by region ----------------
router.get("/api/sales-by-region", (req, res) => {
  const { where, params } = buildFilters(req.query);

  const rows = db
    .prepare(
      `SELECT
         r.region_name,
         SUM(s.revenue) AS revenue
       FROM sales s
       JOIN regions r ON r.id = s.region_id
       JOIN products p ON p.id = s.product_id
       ${where}
       GROUP BY r.id, r.region_name
       ORDER BY revenue DESC`
    )
    .all(params);

  res.json({
    labels: rows.map((r) => r.region_name),
    revenue: rows.map((r) => r.revenue),
  });
});

// ---------------- Paginated sales table ----------------
router.get("/api/sales-table", (req, res) => {
  const { where, params } = buildFilters(req.query);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 10;
  const offset = (page - 1) * perPage;

  const total = db.prepare(`SELECT COUNT(*) AS total FROM sales s ${where}`).get(params).total;

  const rows = db
    .prepare(
      `SELECT
         s.id, s.sale_date, p.product_name, p.category, r.region_name,
         s.quantity, s.unit_price, s.revenue, s.profit
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN regions r ON r.id = s.region_id
       ${where}
       ORDER BY s.sale_date DESC, s.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: perPage, offset });

  res.json({
    rows,
    page,
    per_page: perPage,
    total,
    total_pages: Math.ceil(total / perPage),
  });
});

// ---------------- Filter dropdown options ----------------
// When dataset_id is supplied, options are scoped to that dataset only:
// products/regions/categories that don't appear in its sales are left
// out, so switching datasets never leaves stale filter choices from a
// different upload in the dropdowns. Without dataset_id, the full
// shared catalog is returned instead — used by the Add/Edit Sale form,
// which needs every known product/region available even for a brand
// new, still-empty dataset.
router.get("/api/filter-options", (req, res) => {
  const datasetId = Number(req.query.dataset_id);
  const scoped = Number.isInteger(datasetId) && datasetId > 0;

  if (!scoped) {
    const products = db.prepare("SELECT id, product_name FROM products ORDER BY product_name ASC").all();
    const regions = db.prepare("SELECT id, region_name FROM regions ORDER BY region_name ASC").all();
    const categories = db
      .prepare("SELECT DISTINCT category FROM products ORDER BY category ASC")
      .all()
      .map((r) => r.category);
    return res.json({ products, regions, categories });
  }

  const products = db
    .prepare(
      `SELECT DISTINCT p.id, p.product_name
       FROM products p
       JOIN sales s ON s.product_id = p.id
       WHERE s.dataset_id = ?
       ORDER BY p.product_name ASC`
    )
    .all(datasetId);

  const regions = db
    .prepare(
      `SELECT DISTINCT r.id, r.region_name
       FROM regions r
       JOIN sales s ON s.region_id = r.id
       WHERE s.dataset_id = ?
       ORDER BY r.region_name ASC`
    )
    .all(datasetId);

  const categories = db
    .prepare(
      `SELECT DISTINCT p.category
       FROM products p
       JOIN sales s ON s.product_id = p.id
       WHERE s.dataset_id = ?
       ORDER BY p.category ASC`
    )
    .all(datasetId)
    .map((r) => r.category);

  res.json({ products, regions, categories });
});

module.exports = router;
