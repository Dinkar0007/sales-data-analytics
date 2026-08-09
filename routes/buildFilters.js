/**
 * routes/buildFilters.js
 * Builds a WHERE clause + bound parameters from the dashboard's
 * filter controls (date range, product, region, category, search).
 * Shared by every API route so filtering behaves consistently
 * everywhere. Assumes the query joins `products p` and `regions r`
 * when `category` or `search` are used (see callers).
 */

function buildFilters(query) {
  const conditions = [];
  const params = {};

  if (query.date_from) {
    conditions.push("s.sale_date >= @date_from");
    params.date_from = query.date_from;
  }
  if (query.date_to) {
    conditions.push("s.sale_date <= @date_to");
    params.date_to = query.date_to;
  }
  if (query.product_id) {
    conditions.push("s.product_id = @product_id");
    params.product_id = Number(query.product_id);
  }
  if (query.region_id) {
    conditions.push("s.region_id = @region_id");
    params.region_id = Number(query.region_id);
  }
  if (query.category) {
    conditions.push("p.category = @category");
    params.category = query.category;
  }
  if (query.search) {
    conditions.push(
      "(p.product_name LIKE @search OR p.category LIKE @search OR r.region_name LIKE @search OR s.sale_date LIKE @search)"
    );
    params.search = `%${query.search}%`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, params };
}

module.exports = buildFilters;
