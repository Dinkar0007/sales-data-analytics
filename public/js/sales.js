/**
 * Manage Sales page — front-end logic.
 * Handles the sales table (search/sort/filter/pagination), the
 * Add/Edit/View/Delete modals, and the CSV import/export workflow.
 * Talks to the CRUD API in routes/sales.js.
 */

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const els = {
  search: document.getElementById("f-search"),
  dateFrom: document.getElementById("f-date-from"),
  dateTo: document.getElementById("f-date-to"),
  product: document.getElementById("f-product"),
  category: document.getElementById("f-category"),
  region: document.getElementById("f-region"),
  apply: document.getElementById("btn-apply"),
  reset: document.getElementById("btn-reset"),
  refresh: document.getElementById("btn-refresh"),
  tableBody: document.getElementById("table-body"),
  tableCount: document.getElementById("table-count"),
  pagination: document.getElementById("pagination"),
  userName: document.getElementById("user-name"),
  userAvatar: document.getElementById("user-avatar"),
  logoutLink: document.getElementById("logout-link"),
  btnAdd: document.getElementById("btn-add"),
  btnImport: document.getElementById("btn-import"),
  btnExport: document.getElementById("btn-export"),
};

let state = {
  page: 1,
  sortBy: "date",
  sortDir: "desc",
  productOptions: [],
  regionOptions: [],
};

// ---------------- Toasts ----------------
function toast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.classList.add("toast-visible"), 10);
  setTimeout(() => {
    el.classList.remove("toast-visible");
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ---------------- Modal helpers ----------------
function openModal(id) {
  document.getElementById(id).classList.add("modal-visible");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("modal-visible");
}
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("modal-visible");
  });
});

// ---------------- Fetch helper ----------------
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = "/login.html";
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

// ---------------- Session ----------------
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

// ---------------- Filter dropdowns ----------------
async function loadFilterOptions() {
  const data = await fetchJSON("/api/filter-options");
  if (!data) return;

  state.productOptions = data.products;
  state.regionOptions = data.regions;

  data.products.forEach((p) => {
    els.product.appendChild(new Option(p.product_name, p.id));
  });
  data.regions.forEach((r) => {
    els.region.appendChild(new Option(r.region_name, r.id));
  });
  data.categories.forEach((c) => {
    els.category.appendChild(new Option(c, c));
  });

  // populate the Add/Edit modal's product & region selects too
  const productSelect = document.getElementById("sale-product");
  const regionSelect = document.getElementById("sale-region");
  data.products.forEach((p) => productSelect.appendChild(new Option(p.product_name, p.id)));
  data.regions.forEach((r) => regionSelect.appendChild(new Option(r.region_name, r.id)));
}

// ---------------- Query params from current filters ----------------
function currentFilters(extra = {}) {
  const params = new URLSearchParams();
  if (els.search.value.trim()) params.set("search", els.search.value.trim());
  if (els.dateFrom.value) params.set("date_from", els.dateFrom.value);
  if (els.dateTo.value) params.set("date_to", els.dateTo.value);
  if (els.product.value) params.set("product_id", els.product.value);
  if (els.category.value) params.set("category", els.category.value);
  if (els.region.value) params.set("region_id", els.region.value);
  params.set("sort_by", state.sortBy);
  params.set("sort_dir", state.sortDir);
  Object.entries(extra).forEach(([k, v]) => params.set(k, v));
  return params.toString();
}

// ---------------- Table ----------------
async function loadTable(page = 1) {
  state.page = page;
  els.tableBody.innerHTML = `<tr><td colspan="9" class="table-empty">Loading…</td></tr>`;

  let data;
  try {
    data = await fetchJSON(`/api/sales?${currentFilters({ page })}`);
  } catch (err) {
    els.tableBody.innerHTML = `<tr><td colspan="9" class="table-empty">Could not load records.</td></tr>`;
    return;
  }
  if (!data) return;

  if (!data.rows.length) {
    els.tableBody.innerHTML = `<tr><td colspan="9" class="table-empty">No sales records match the selected filters.</td></tr>`;
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
          <td class="actions-col">
            <button class="row-action" data-action="view" data-id="${r.id}" title="View">👁</button>
            <button class="row-action" data-action="edit" data-id="${r.id}" title="Edit">✎</button>
            <button class="row-action row-action-danger" data-action="delete" data-id="${r.id}" title="Delete">🗑</button>
          </td>
        </tr>`
      )
      .join("");
  }

  els.tableCount.textContent = `${data.total.toLocaleString("en-IN")} records`;
  renderPagination(data.page, data.total_pages);
  updateSortIndicators();
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

function updateSortIndicators() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === state.sortBy) {
      th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const col = th.dataset.sort;
    if (state.sortBy === col) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortBy = col;
      state.sortDir = "asc";
    }
    loadTable(1);
  });
});

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- Filters toolbar ----------------
els.apply.addEventListener("click", () => loadTable(1));
els.refresh.addEventListener("click", () => loadTable(state.page));
els.search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadTable(1);
});
els.reset.addEventListener("click", () => {
  els.search.value = "";
  els.dateFrom.value = "";
  els.dateTo.value = "";
  els.product.value = "";
  els.category.value = "";
  els.region.value = "";
  loadTable(1);
});

// ---------------- Add / Edit Sale ----------------
const saleModalOverlay = "sale-modal-overlay";
const saleForm = document.getElementById("sale-form");
const saleFormError = document.getElementById("sale-form-error");

function resetSaleForm() {
  saleForm.reset();
  document.getElementById("sale-id").value = "";
  saleFormError.style.display = "none";
}

els.btnAdd.addEventListener("click", () => {
  resetSaleForm();
  document.getElementById("sale-modal-title").textContent = "Add Sale";
  document.getElementById("sale-form-submit").textContent = "Save Sale";
  openModal(saleModalOverlay);
});

async function openEditModal(id) {
  resetSaleForm();
  try {
    const sale = await fetchJSON(`/api/sales/${id}`);
    if (!sale) return;
    document.getElementById("sale-id").value = sale.id;
    document.getElementById("sale-date").value = sale.sale_date;
    document.getElementById("sale-product").value = sale.product_id;
    document.getElementById("sale-region").value = sale.region_id;
    document.getElementById("sale-quantity").value = sale.quantity;
    document.getElementById("sale-unit-price").value = sale.unit_price;
    document.getElementById("sale-profit").value = sale.profit;
    document.getElementById("sale-modal-title").textContent = "Edit Sale";
    document.getElementById("sale-form-submit").textContent = "Update Sale";
    openModal(saleModalOverlay);
  } catch (err) {
    toast(err.message, "error");
  }
}

saleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  saleFormError.style.display = "none";

  const id = document.getElementById("sale-id").value;
  const payload = {
    sale_date: document.getElementById("sale-date").value,
    product_id: document.getElementById("sale-product").value,
    region_id: document.getElementById("sale-region").value,
    quantity: document.getElementById("sale-quantity").value,
    unit_price: document.getElementById("sale-unit-price").value,
  };
  const profitVal = document.getElementById("sale-profit").value;
  if (profitVal !== "") payload.profit = profitVal;

  try {
    if (id) {
      await fetchJSON(`/api/sales/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Sale updated successfully.");
    } else {
      await fetchJSON("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Sale added successfully.");
    }
    closeModal(saleModalOverlay);
    loadTable(state.page);
  } catch (err) {
    saleFormError.textContent = err.message;
    saleFormError.style.display = "block";
  }
});

// ---------------- View Sale ----------------
async function openViewModal(id) {
  try {
    const sale = await fetchJSON(`/api/sales/${id}`);
    if (!sale) return;
    document.getElementById("view-modal-body").innerHTML = `
      <div class="view-grid">
        <div><span class="view-label">Sale ID</span><span class="view-value">#${sale.id}</span></div>
        <div><span class="view-label">Date</span><span class="view-value">${formatDate(sale.sale_date)}</span></div>
        <div><span class="view-label">Product</span><span class="view-value">${escapeHtml(sale.product_name)}</span></div>
        <div><span class="view-label">Category</span><span class="view-value">${escapeHtml(sale.category)}</span></div>
        <div><span class="view-label">Region</span><span class="view-value">${escapeHtml(sale.region_name)}</span></div>
        <div><span class="view-label">Quantity</span><span class="view-value">${sale.quantity}</span></div>
        <div><span class="view-label">Unit Price</span><span class="view-value">${money(sale.unit_price)}</span></div>
        <div><span class="view-label">Revenue</span><span class="view-value">${money(sale.revenue)}</span></div>
        <div><span class="view-label">Profit</span><span class="view-value">${money(sale.profit)}</span></div>
      </div>
    `;
    openModal("view-modal-overlay");
  } catch (err) {
    toast(err.message, "error");
  }
}

// ---------------- Delete Sale ----------------
let pendingDeleteId = null;

function openDeleteModal(id) {
  pendingDeleteId = id;
  openModal("delete-modal-overlay");
}

document.getElementById("confirm-delete-btn").addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  try {
    await fetchJSON(`/api/sales/${pendingDeleteId}`, { method: "DELETE" });
    toast("Sale deleted successfully.");
    closeModal("delete-modal-overlay");
    loadTable(state.page);
  } catch (err) {
    toast(err.message, "error");
  } finally {
    pendingDeleteId = null;
  }
});

// ---------------- Row action delegation ----------------
els.tableBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".row-action");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === "view") openViewModal(id);
  if (action === "edit") openEditModal(id);
  if (action === "delete") openDeleteModal(id);
});

// ---------------- CSV Export ----------------
els.btnExport.addEventListener("click", () => {
  window.location.href = `/api/sales/export?${currentFilters()}`;
});

// ---------------- CSV Import ----------------
const importOverlay = "import-modal-overlay";
const importFileInput = document.getElementById("import-file-input");
const importStepSelect = document.getElementById("import-step-select");
const importStepPreview = document.getElementById("import-step-preview");
const importError = document.getElementById("import-error");
const importConfirmBtn = document.getElementById("import-confirm-btn");
let pendingImportRows = null;

els.btnImport.addEventListener("click", () => {
  importFileInput.value = "";
  importStepSelect.style.display = "block";
  importStepPreview.style.display = "none";
  importError.style.display = "none";
  importConfirmBtn.style.display = "none";
  pendingImportRows = null;
  openModal(importOverlay);
});

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files[0];
  if (!file) return;

  importError.style.display = "none";
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/sales/import/preview", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not preview the file.");

    pendingImportRows = data.valid_rows;

    document.getElementById("import-summary").textContent =
      `${data.total_rows} rows found — ${data.valid_count} valid, ${data.invalid_count} invalid.`;

    const invalidBlock = document.getElementById("import-invalid-block");
    if (data.invalid_count > 0) {
      invalidBlock.style.display = "block";
      document.getElementById("import-invalid-body").innerHTML = data.invalid_rows
        .map((r) => `<tr><td>${r.row}</td><td>${escapeHtml(r.errors.join(", "))}</td></tr>`)
        .join("");
    } else {
      invalidBlock.style.display = "none";
    }

    document.getElementById("import-valid-body").innerHTML = data.valid_rows
      .map(
        (r) => `<tr>
          <td>${r.sale_date}</td><td>${escapeHtml(r.product_name)}</td><td>${escapeHtml(r.category)}</td>
          <td>${escapeHtml(r.region_name)}</td><td>${r.quantity}</td><td>${money(r.unit_price)}</td>
        </tr>`
      )
      .join("");

    importStepSelect.style.display = "none";
    importStepPreview.style.display = "block";
    importConfirmBtn.style.display = data.valid_count > 0 ? "inline-flex" : "none";
  } catch (err) {
    importError.textContent = err.message;
    importError.style.display = "block";
  }
});

importConfirmBtn.addEventListener("click", async () => {
  if (!pendingImportRows || !pendingImportRows.length) return;
  try {
    const data = await fetchJSON("/api/sales/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: pendingImportRows }),
    });
    toast(data.message);
    closeModal(importOverlay);
    await loadFilterOptions(); // new products/regions may have been created
    loadTable(1);
  } catch (err) {
    toast(err.message, "error");
  }
});

// ---------------- Init ----------------
document.addEventListener("DOMContentLoaded", async () => {
  await loadSession();
  await loadFilterOptions();
  await loadTable(1);
});
