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

The database (`db/sales_dashboard.db`) is already included, pre-loaded with the admin user, products, regions, and a batch of sample sales records — so you can skip straight to starting the server. (If you ever want a fresh set of random sample data, run `npm run seed` — see section 8.)

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

### Overview page (`/`)
The original analytics dashboard: 4 KPI cards (Revenue, Profit, Orders, Avg Order Value), a monthly Revenue & Profit trend chart, a Top Products bar chart, a Sales by Region donut chart, filters (date range, product, **category**, region), and a read-only recent-sales table.

### Manage Sales page (`/sales.html`) — new
The full data management screen:
- **Search** — matches product, category, region, or date
- **Filters** — date range, product, category, region (independent of the dashboard's filters)
- **Sortable columns** — click any column header to sort (date, product, category, region, quantity, unit price, revenue, profit)
- **Pagination** — 10 records per page
- **Add Sale** — modal form with full validation
- **Edit Sale** — pre-filled modal, partial updates supported
- **Delete Sale** — confirmation dialog before deleting
- **View Sale** — read-only detail modal
- **Import CSV** — two-step wizard: upload → preview (valid rows vs. rows with errors, shown separately) → confirm import
- **Export CSV** — downloads the currently filtered view as a `.csv` file
- **Refresh button** — reloads the table without changing filters

Every add/edit/delete/import immediately updates the Manage Sales table, and the next time you open the Overview dashboard, its KPIs and charts reflect the new data too — nothing is cached, every request reads live from SQLite.

---

## 4. Project structure

```
sales-dashboard-js/
├── server.js                  Main Express server & routing
├── package.json                Dependencies + npm scripts (start, seed)
├── db/
│   ├── seed.js                 Creates schema + sample data (run to reset)
│   ├── connection.js           Shared SQLite connection
│   └── sales_dashboard.db      The database file
├── middleware/
│   └── requireAuth.js          Session guard for protected pages/API
├── routes/
│   ├── auth.js                  /api/login, /api/logout, /api/me
│   ├── dashboard.js             Read-only analytics endpoints (KPIs, charts)
│   ├── sales.js                 CRUD + CSV import/export endpoints (new)
│   └── buildFilters.js          Shared filter/query-building logic
└── public/                      Everything served to the browser
    ├── login.html
    ├── index.html                Overview / dashboard page
    ├── sales.html                Manage Sales page (new)
    ├── css/style.css             Shared styling (dashboard + management UI)
    └── js/
        ├── dashboard.js          Overview page logic
        ├── sales.js               Manage Sales page logic (new)
        └── vendor/chart.umd.js    Chart.js (bundled locally, no CDN needed)
```

---

## 5. Database schema

No existing tables or columns were changed — only new rows get added through the app.

```
users(id, full_name, username, password, created_at)
products(id, product_name, category, unit_price)
regions(id, region_name)
sales(id, product_id, region_id, sale_date, quantity, unit_price, revenue, profit)
```

`revenue` is always server-computed as `quantity x unit_price` (never trusted from the client). `profit` defaults to 20% of revenue if not supplied, but can be entered manually in the Add/Edit form or a CSV's optional `Profit` column.

---

## 6. API endpoints

### Auth (public)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/login` | Log in, starts a session |
| POST | `/api/logout` | Destroys the session |
| GET | `/api/me` | Returns the logged-in user's name |

### Analytics (session required)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/summary` | KPI totals |
| GET | `/api/sales-by-date` | Monthly revenue/profit trend |
| GET | `/api/sales-by-product` | Top products by revenue |
| GET | `/api/sales-by-region` | Revenue by region |
| GET | `/api/filter-options` | Product/region/category lists for dropdowns |

All analytics endpoints accept optional query filters: `date_from`, `date_to`, `product_id`, `category`, `region_id`.

### Sales data management (session required) — new
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/sales` | List sales — supports `search`, `sort_by`, `sort_dir`, `page`, `per_page`, plus all the filters above |
| GET | `/api/sales/:id` | Full detail of one sale |
| POST | `/api/sales` | Create a sale |
| PUT | `/api/sales/:id` | Update a sale (partial updates supported) |
| DELETE | `/api/sales/:id` | Delete a sale |
| POST | `/api/sales/import/preview` | Upload a CSV (multipart `file` field), validates and returns valid/invalid rows — does not write to the database yet |
| POST | `/api/sales/import/confirm` | Takes the `valid_rows` from the preview step and inserts them |
| GET | `/api/sales/export` | Downloads a CSV of the (optionally filtered) sales data |

Standard HTTP status codes are used throughout: `200` success, `201` created, `400` bad input, `401` not authenticated, `404` not found, `500` server error. Error responses are always `{ "error": "human-readable message" }` — no stack traces are ever sent to the browser.

---

## 7. CSV import format

```
Date,Product,Category,Region,Quantity,UnitPrice
2026-07-01,Wireless Mouse,Electronics,North,4,799
```

- `Date` must be `YYYY-MM-DD`.
- An optional `Profit` column can be added at the end — if omitted, profit defaults to 20% of revenue for that row.
- If `Product` or `Region` doesn't already exist, a new one is created automatically (matching is case-insensitive, so `wireless mouse` and `Wireless Mouse` are treated as the same product).
- Rows with a bad date, missing text field, non-positive quantity, or non-positive price are flagged as invalid and are not imported — you'll see exactly which row and which field failed before confirming anything.

---

## 8. Resetting the sample data

```bash
npm run seed
```
This drops and recreates all four tables, so any records you've added through the app (including anything imported via CSV) will be wiped along with the sample data. Use this if you want to start fresh for a demo.

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
