/**
 * Sales Data Analytics Dashboard — front-end logic
 * Fetches filtered data from the Node/Express + SQLite API endpoints
 * and renders KPI cards, Chart.js visualizations, and the paginated
 * sales table.
 */

const money = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const els = {
  dataset: document.getElementById("f-dataset"),
  datasetMeta: document.getElementById("dataset-meta"),
  noDatasetState: document.getElementById("no-dataset-state"),
  dashboardContent: document.getElementById("dashboard-content"),
  dateFrom: document.getElementById("f-date-from"),
  dateTo: document.getElementById("f-date-to"),
  product: document.getElementById("f-product"),
  category: document.getElementById("f-category"),
  region: document.getElementById("f-region"),
  apply: document.getElementById("btn-apply"),
  reset: document.getElementById("btn-reset"),
  kpiRevenue: document.getElementById("kpi-revenue"),
  kpiProfit: document.getElementById("kpi-profit"),
  kpiOrders: document.getElementById("kpi-orders"),
  kpiAov: document.getElementById("kpi-aov"),
  tableBody: document.getElementById("table-body"),
  tableCount: document.getElementById("table-count"),
  pagination: document.getElementById("pagination"),
  userName: document.getElementById("user-name"),
  userAvatar: document.getElementById("user-avatar"),
  logoutLink: document.getElementById("logout-link"),
};

let currentPage = 1;
let charts = { trend: null, products: null, region: null };
let datasets = [];

// The selected dataset is remembered in localStorage so the Overview
// and Manage Sales pages (separate page loads) stay in sync.
const DATASET_STORAGE_KEY = "salesDashboard.selectedDatasetId";
function getStoredDatasetId() {
  return localStorage.getItem(DATASET_STORAGE_KEY) || "";
}
function setStoredDatasetId(id) {
  if (id) localStorage.setItem(DATASET_STORAGE_KEY, id);
  else localStorage.removeItem(DATASET_STORAGE_KEY);
}

function currentFilters(extra = {}) {
  const params = new URLSearchParams();
  if (els.dataset.value) params.set("dataset_id", els.dataset.value);
  if (els.dateFrom.value) params.set("date_from", els.dateFrom.value);
  if (els.dateTo.value) params.set("date_to", els.dateTo.value);
  if (els.product.value) params.set("product_id", els.product.value);
  if (els.category.value) params.set("category", els.category.value);
  if (els.region.value) params.set("region_id", els.region.value);
  Object.entries(extra).forEach(([k, v]) => params.set(k, v));
  return params.toString();
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.href = "/login.html";
    return null;
  }
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

// ---------------- Session / user info ----------------
async function loadSession() {
  const data = await fetchJSON("/api/me");
  if (!data || !data.authenticated) {
    window.location.href = "/login.html";
    return;
  }
  els.userName.textContent = data.name || "User";
  els.userAvatar.textContent = (data.name || "U").charAt(0).toUpperCase();
}

els.logoutLink.addEventListener("click", async (e) => {
  e.preventDefault();
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
});

// ---------------- Dataset selector ----------------
async function loadDatasets() {
  const data = await fetchJSON("/api/datasets");
  if (!data) return;
  datasets = data.datasets || [];

  const stored = getStoredDatasetId();
  const validStoredId = datasets.some((d) => String(d.id) === stored) ? stored : "";
  const selectedId = validStoredId || (datasets.length ? String(datasets[0].id) : "");

  els.dataset.innerHTML = "";
  if (!datasets.length) {
    els.dataset.innerHTML = `<option value="">No datasets uploaded yet</option>`;
  } else {
    datasets.forEach((d) => {
      els.dataset.appendChild(new Option(`${d.name} (${d.row_count} rows)`, d.id));
    });
    els.dataset.value = selectedId;
  }

  setStoredDatasetId(selectedId);
  updateDatasetMeta();
  toggleEmptyState();
}

function updateDatasetMeta() {
  const selected = datasets.find((d) => String(d.id) === els.dataset.value);
  if (!selected) {
    els.datasetMeta.textContent = "";
    return;
  }
  const uploaded = new Date(selected.uploaded_at || selected.created_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  els.datasetMeta.textContent = `Uploaded ${uploaded} · ${selected.row_count.toLocaleString("en-IN")} records`;
}

function toggleEmptyState() {
  const hasDataset = Boolean(els.dataset.value);
  els.noDatasetState.style.display = hasDataset ? "none" : "block";
  els.dashboardContent.style.display = hasDataset ? "" : "none";
}

els.dataset.addEventListener("change", async () => {
  setStoredDatasetId(els.dataset.value);
  updateDatasetMeta();
  toggleEmptyState();
  if (!els.dataset.value) return;
  await loadFilterOptions();
  await refreshAll();
});

// ---------------- Filter dropdowns ----------------
async function loadFilterOptions() {
  els.product.innerHTML = `<option value="">All products</option>`;
  els.category.innerHTML = `<option value="">All categories</option>`;
  els.region.innerHTML = `<option value="">All regions</option>`;

  if (!els.dataset.value) return;

  const data = await fetchJSON(`/api/filter-options?dataset_id=${encodeURIComponent(els.dataset.value)}`);
  if (!data) return;

  data.products.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.product_name;
    els.product.appendChild(opt);
  });

  data.regions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.region_name;
    els.region.appendChild(opt);
  });

  data.categories.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    els.category.appendChild(opt);
  });
}

// ---------------- KPI cards ----------------
async function loadSummary() {
  const data = await fetchJSON(`/api/summary?${currentFilters()}`);
  if (!data) return;
  els.kpiRevenue.textContent = money(data.total_revenue);
  els.kpiProfit.textContent = money(data.total_profit);
  els.kpiOrders.textContent = Number(data.total_orders).toLocaleString("en-IN");
  els.kpiAov.textContent = money(data.avg_order_value);
}

// ---------------- Charts ----------------
const chartPalette = {
  teal: "#2F6F63",
  amber: "#C8862E",
  slate: "#4C5670",
  brick: "#B54B3B",
  navySoft: "#8891A8",
};

async function loadTrendChart() {
  const data = await fetchJSON(`/api/sales-by-date?${currentFilters()}`);
  if (!data) return;
  const ctx = document.getElementById("chart-trend");

  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "Revenue",
          data: data.revenue,
          borderColor: chartPalette.teal,
          backgroundColor: "rgba(47,111,99,0.10)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
        {
          label: "Profit",
          data: data.profit,
          borderColor: chartPalette.amber,
          backgroundColor: "rgba(200,134,46,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        y: { ticks: { callback: (v) => "₹" + v.toLocaleString("en-IN") } },
      },
    },
  });
}

async function loadProductChart() {
  const data = await fetchJSON(`/api/sales-by-product?${currentFilters()}`);
  if (!data) return;
  const ctx = document.getElementById("chart-products");

  if (charts.products) charts.products.destroy();
  charts.products = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "Revenue",
          data: data.revenue,
          backgroundColor: chartPalette.teal,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: (v) => "₹" + v.toLocaleString("en-IN") } },
      },
    },
  });
}

async function loadRegionChart() {
  const data = await fetchJSON(`/api/sales-by-region?${currentFilters()}`);
  if (!data) return;
  const ctx = document.getElementById("chart-region");

  const palette = [chartPalette.teal, chartPalette.amber, chartPalette.slate, chartPalette.brick, chartPalette.navySoft];

  if (charts.region) charts.region.destroy();
  charts.region = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: data.labels,
      datasets: [
        {
          data: data.revenue,
          backgroundColor: data.labels.map((_, i) => palette[i % palette.length]),
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
    },
  });
}

// ---------------- Sales table ----------------
async function loadTable(page = 1) {
  currentPage = page;
  els.tableBody.innerHTML = `<tr><td colspan="8" class="table-empty">Loading…</td></tr>`;

  const data = await fetchJSON(`/api/sales-table?${currentFilters({ page })}`);
  if (!data) return;

  if (!data.rows.length) {
    els.tableBody.innerHTML = `<tr><td colspan="8" class="table-empty">No sales records match the selected filters.</td></tr>`;
  } else {
    els.tableBody.innerHTML = data.rows
      .map(
        (r) => `
        <tr>
          <td>${formatDate(r.sale_date)}</td>
          <td>${escapeHtml(r.product_name)}</td>
          <td><span class="category-pill">${escapeHtml(r.category)}</span></td>
          <td>${escapeHtml(r.region_name)}</td>
          <td class="num">${r.quantity}</td>
          <td class="num">${money(r.unit_price)}</td>
          <td class="num">${money(r.revenue)}</td>
          <td class="num">${money(r.profit)}</td>
        </tr>`
      )
      .join("");
  }

  els.tableCount.textContent = `${data.total.toLocaleString("en-IN")} records`;
  renderPagination(data.page, data.total_pages);
}

function renderPagination(page, totalPages) {
  if (totalPages <= 1) {
    els.pagination.innerHTML = "";
    return;
  }
  els.pagination.innerHTML = `
    <button id="pg-prev" ${page <= 1 ? "disabled" : ""}>&larr; Prev</button>
    <span>Page ${page} of ${totalPages}</span>
    <button id="pg-next" ${page >= totalPages ? "disabled" : ""}>Next &rarr;</button>
  `;
  document.getElementById("pg-prev")?.addEventListener("click", () => loadTable(page - 1));
  document.getElementById("pg-next")?.addEventListener("click", () => loadTable(page + 1));
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- Orchestration ----------------
async function refreshAll() {
  if (!els.dataset.value) {
    toggleEmptyState();
    return;
  }
  await Promise.all([loadSummary(), loadTrendChart(), loadProductChart(), loadRegionChart(), loadTable(1)]);
}

els.apply.addEventListener("click", refreshAll);
els.reset.addEventListener("click", () => {
  els.dateFrom.value = "";
  els.dateTo.value = "";
  els.product.value = "";
  els.category.value = "";
  els.region.value = "";
  refreshAll();
});

async function init() {
  await loadSession();
  await loadDatasets();
  await loadFilterOptions();
  await refreshAll();
}

document.addEventListener("DOMContentLoaded", init);

// If the browser restores this page from back/forward cache (e.g. after
// navigating to Manage Sales, importing a CSV, then hitting Back), the
// DOMContentLoaded handler above does NOT re-run — the page is repainted
// from a snapshot instead. This listener forces a fresh data pull whenever
// that happens, so Overview never shows stale KPIs/charts, and always
// reflects whichever dataset is currently selected, after navigating back.
window.addEventListener("pageshow", async (event) => {
  if (event.persisted) {
    await loadDatasets();
    await loadFilterOptions();
    await refreshAll();
  }
});
