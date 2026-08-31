# Sales Data Management and Analytics System

A web-based Sales Data Analytics Dashboard **plus** full CRUD data management, built with **Node.js, Express, SQLite (better-sqlite3), express-session, bcryptjs, and Chart.js** — no PHP, no MySQL, no XAMPP required.

This started as an analytics-only dashboard and has been upgraded into a complete management system: you can now add, edit, delete, search, filter, sort, import (CSV), and export sales data directly through the web interface, and every dashboard chart/KPI updates immediately from the live database.

---

## 1. Requirements

- [Node.js](https://nodejs.org/) (v18 or newer) — includes `npm`
- VS Code (or any editor/terminal)

No XAMPP, no separate database server — SQLite stores everything in a single file inside the project.

---

## 2. Setup instructions (VS Code)

### Step 1 — Open the project
Open the `sales-dashboard-js` folder in VS Code (`File → Open Folder`).

### Step 2 — Open the integrated terminal
`` Ctrl + ` `` (or `Terminal → New Terminal`)

### Step 3 — Install dependencies
```bash
npm install
```

This project's schema now includes a `datasets` table (see section 3 below), so the database is **not** pre-built into the zip — create it with the seed script before starting the server for the first time:
```bash
npm run seed
```
This creates `db/sales_dashboard.db`, pre-loaded with the admin user and one sample dataset ("Sample Sales Data"). Re-run this any time you want to wipe everything and start fresh.

### Step 4 — Start the server
```bash
npm start
```
You'll see:
```
Sales Data Analytics Dashboard running at http://localhost:3000
```

### Step 5 — Open it in your browser
Go to **http://localhost:3000**

Log in with:

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

To stop the server, press `Ctrl + C` in the terminal.

---

## 3. What's in the app

### Datasets — every upload is kept separate
Each CSV import creates a brand-new **dataset** instead of merging into whatever was uploaded before. A dataset selector (top of both the Overview and Manage Sales pages) lets you switch between every dataset you've ever uploaded — the KPI cards, charts, filters, and sales table all read from exactly one selected dataset at a time. You can also:
- **Import CSV** — name the new dataset (pre-filled from the file name), preview valid/invalid rows, then confirm. The rows always land in a fresh dataset, never appended to an existing one.
- **+ New Dataset** — create an empty dataset to start adding sales manually.
- **Delete Dataset** — permanently removes a dataset and all of its sales rows.
- The selected dataset is remembered (via the browser's local storage) so it stays the same as you move between the Overview and Manage Sales pages.

### Overview page (`/`)
The original analytics dashboard: 4 KPI cards (Revenue, Profit, Orders, Avg Order Value), a monthly Revenue & Profit trend chart, a Top Products bar chart, a Sales by Region donut chart, filters (date range, product, **category**, region), and a read-only recent-sales table — all scoped to the dataset currently selected at the top of the page.

### Manage Sales page (`/sales.html`) — new
The full data management screen:
- **Search** — matches product, category, region, or date (within the selected dataset)
- **Filters** — date range, product, category, region (independent of the dashboard's filters)
- **Sortable columns** — click any column header to sort (date, product, category, region, quantity, unit price, revenue, profit)
- **Pagination** — 10 records per page
- **Add Sale** — modal form with full validation, added to the currently selected dataset
- **Edit Sale** — pre-filled modal, partial updates supported
- **Delete Sale** — confirmation dialog before deleting
- **View Sale** — read-only detail modal
- **Import CSV** — three-step wizard: upload → preview (valid rows vs. rows with errors, shown separately) → name the new dataset and confirm import
- **Export CSV** — downloads the currently filtered view (from the selected dataset) as a `.csv` file
- **Refresh button** — reloads the table without changing filters

Every add/edit/delete/import immediately updates the Manage Sales table, and the next time you open the Overview dashboard, its KPIs and charts reflect the new data too — nothing is cached, every request reads live from SQLite, scoped to whichever dataset is selected.

---

## 4. Project structure

```
sales-dashboard-js/
├── server.js                  Main Express server & routing
├── package.json                Dependencies + npm scripts (start, seed)
├── db/
│   ├── seed.js                 Creates schema + sample data (run to reset)
│   ├── connection.js           Shared SQLite connection
│   └── sales_dashboard.db      The database file (created by `npm run seed`)
├── middleware/
│   └── requireAuth.js          Session guard for protected pages/API
├── routes/
│   ├── auth.js                  /api/login, /api/logout, /api/me
│   ├── dashboard.js             Read-only analytics endpoints (KPIs, charts)
│   ├── sales.js                 CRUD + CSV import/export endpoints
│   ├── datasets.js              Dataset list/create/rename/delete endpoints (new)
│   └── buildFilters.js          Shared filter/query-building logic (dataset-scoped)
└── public/                      Everything served to the browser
    ├── login.html
    ├── index.html                Overview / dashboard page
    ├── sales.html                Manage Sales page
    ├── css/style.css             Shared styling (dashboard + management UI)
    └── js/
        ├── dashboard.js          Overview page logic (dataset-aware)
        ├── sales.js               Manage Sales page logic (dataset-aware)
        └── vendor/chart.umd.js    Chart.js (bundled locally, no CDN needed)
```

---

## 5. Database schema

```
users(id, full_name, username, password, created_at)
products(id, product_name, category, unit_price)
regions(id, region_name)
datasets(id, name, source_filename, created_at)
sales(id, dataset_id, product_id, region_id, sale_date, quantity, unit_price, revenue, profit)
```

Every `sales` row belongs to exactly one `datasets` row (`dataset_id`, with `ON DELETE CASCADE` — deleting a dataset deletes its sales too). `products` and `regions` remain a shared catalog across all datasets (so the same "Wireless Mouse" product isn't duplicated every time it shows up in a new CSV), but every read (KPIs, charts, table, filters) is always scoped to a single `dataset_id` — nothing is ever aggregated across datasets.

`revenue` is always server-computed as `quantity x unit_price` (never trusted from the client). `profit` defaults to 20% of revenue if not supplied, but can be entered manually in the Add/Edit form or a CSV's optional `Profit` column.

---

## 6. API endpoints

### Auth (public)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/login` | Log in, starts a session |
| POST | `/api/logout` | Destroys the session |
| GET | `/api/me` | Returns the logged-in user's name |

### Datasets (session required) — new
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/datasets` | List every dataset, with row counts, for the selector |
| POST | `/api/datasets` | Create a new, empty dataset (`{ name }`) |
| PUT | `/api/datasets/:id` | Rename a dataset |
| DELETE | `/api/datasets/:id` | Delete a dataset and all of its sales rows |

### Analytics (session required)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/summary` | KPI totals |
| GET | `/api/sales-by-date` | Monthly revenue/profit trend |
| GET | `/api/sales-by-product` | Top products by revenue |
| GET | `/api/sales-by-region` | Revenue by region |
| GET | `/api/filter-options` | Product/region/category lists for dropdowns — pass `dataset_id` to scope to one dataset's contents, or omit it for the full shared catalog (used by the Add/Edit Sale form) |

All analytics endpoints **require** a `dataset_id` query parameter — without one, they return empty results rather than mixing every dataset together. They also accept the optional filters: `date_from`, `date_to`, `product_id`, `category`, `region_id`.

### Sales data management (session required)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/sales` | List sales — supports `dataset_id`, `search`, `sort_by`, `sort_dir`, `page`, `per_page`, plus all the filters above |
| GET | `/api/sales/:id` | Full detail of one sale |
| POST | `/api/sales` | Create a sale — requires `dataset_id` in the body |
| PUT | `/api/sales/:id` | Update a sale (partial updates supported; stays in its original dataset) |
| DELETE | `/api/sales/:id` | Delete a sale |
| POST | `/api/sales/import/preview` | Upload a CSV (multipart `file` field), validates and returns valid/invalid rows — does not write to the database yet |
| POST | `/api/sales/import/confirm` | Takes the `valid_rows` from the preview step plus a `dataset_name`, creates a **new** dataset, and inserts the rows into it |
| GET | `/api/sales/export` | Downloads a CSV of the (optionally filtered) sales data for the selected dataset |

Standard HTTP status codes are used throughout: `200` success, `201` created, `400` bad input, `401` not authenticated, `404` not found, `500` server error. Error responses are always `{ "error": "human-readable message" }` — no stack traces are ever sent to the browser.

---

## 7. CSV import format

```
Date,Product,Category,Region,Quantity,UnitPrice
2026-07-01,Wireless Mouse,Electronics,North,4,799
```

- `Date` must be `YYYY-MM-DD`.
- An optional `Profit` column can be added at the end — if omitted, profit defaults to 20% of revenue for that row.
- If `Product` or `Region` doesn't already exist in the shared catalog, a new one is created automatically (matching is case-insensitive, so `wireless mouse` and `Wireless Mouse` are treated as the same product).
- Rows with a bad date, missing text field, non-positive quantity, or non-positive price are flagged as invalid and are not imported — you'll see exactly which row and which field failed before confirming anything.
- **Every confirmed import creates a brand-new dataset.** You'll be asked to name it (pre-filled from the CSV's file name) before the rows are saved — nothing is ever appended to a dataset you uploaded earlier.

---

## 8. Resetting the sample data

```bash
npm run seed
```
This drops and recreates every table (including `datasets`), so **all** datasets — the sample one and anything you've added or imported since — are wiped. Use this if you want to start completely fresh for a demo.

---

## 9. Security notes

- Passwords are hashed with `bcryptjs` — never stored in plain text.
- Every database query in `routes/sales.js` and `routes/dashboard.js` uses parameterized queries (better-sqlite3's `?`/`@param` placeholders) — no raw string concatenation of user input into SQL, anywhere.
- The one place a column name (not a value) is chosen dynamically — sorting — uses a hardcoded whitelist (`SORT_COLUMNS` in `routes/sales.js`), since column names can't be parameterized. Any unrecognized `sort_by` value silently falls back to the default rather than being used directly.
- Every `/api/*` route (except login/logout/me) requires an active session; both the Overview and Manage Sales pages redirect to the login page if you're not authenticated.
- CSV uploads are capped at 2MB and only the `file` field is accepted (via `multer`); oversized or malformed uploads return a clean `400` error instead of crashing the server.

---

## 10. Deployment notes

- The server reads `PORT` from the environment (`process.env.PORT`), so it works on any Node.js hosting platform (Render, Railway, Fly.io, etc.) without code changes.
- Set a `SESSION_SECRET` environment variable in production — the code falls back to a fixed dev secret if it's not set, which is fine for local/college use but should not be relied on for a public deployment.
- SQLite limitation: SQLite is a single-file, single-server database. It's excellent for a local demo, a college project, or a low-traffic personal project, but most hosting platforms (Render, Railway, Vercel, etc.) use ephemeral or read-only filesystems for the app itself — meaning the `.db` file can be wiped on every redeploy or restart unless you specifically attach persistent disk storage. For a real production deployment with multiple users or servers, a hosted database (PostgreSQL, MySQL) would be the standard choice instead. This isn't a bug in the app — it's a genuine limitation of SQLite in most cloud environments, and it's worth mentioning in a viva if asked about scaling this project.

---

## 11. How to explain this project in a BCA viva

What it is: A Sales Data Analytics Dashboard that has been extended into a full data management system — you can log in, add/edit/delete individual sales records, bulk-import records from a CSV file, export data back out as CSV, and see all of that reflected instantly in KPI cards and charts.

Tech stack, in one sentence each:
- Node.js + Express — the backend server and REST API.
- SQLite (better-sqlite3) — a lightweight, file-based database; no separate database server needed.
- express-session + bcryptjs — login sessions and secure password hashing.
- Chart.js — renders the trend line, bar, and doughnut charts.
- Vanilla JavaScript (fetch API) — the frontend talks to the backend purely through JSON API calls, no page reloads.

Architecture, if asked to describe the flow: Browser -> fetch() call -> Express route -> parameterized SQLite query -> JSON response -> JavaScript updates the DOM/Chart.js. The same pattern is used for every feature: list, add, edit, delete, import, export, and every analytics chart.

If asked "why SQLite instead of MySQL": SQLite needs no separate server process or installation — the whole database is one file — which makes the project trivially easy to set up and run anywhere, ideal for a student project. The tradeoff (worth mentioning if asked) is that it doesn't handle concurrent writes from many users as well as a client-server database like MySQL or PostgreSQL would, which is why production systems with many simultaneous users typically use a hosted database instead.

If asked about security: Passwords are hashed with bcrypt, all SQL queries use parameterized placeholders (preventing SQL injection), every protected route checks the session before returning data, and the one place where a column name is chosen dynamically (sorting) uses a fixed whitelist rather than trusting the client's input directly.

---

## 12. Default login

| Username | Password  |
|----------|-----------|
| admin    | admin123  |

You can change this by editing `db/seed.js` (search for `admin123`) and re-running `npm run seed`.
