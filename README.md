# Purchase Manager Portal

A standalone React (Vite) portal for the **Purchase Manager** role, part of the Tesco
Structures CRM. It reuses the existing Sales Head backend — same authentication,
same `users` collection, same MongoDB — and adds procurement (vendors + purchase
orders) on top.

## What it does
- Dedicated, procurement-themed **login** (role-locked to `Purchase Manager`).
- **Dashboard** — KPI summary + Purchase Progress rollup (one row per PO).
- **Vendors** — vendor registration with outstanding / available-credit (calculated).
- **Purchase Orders** — material-wise PO lines with delivery & payment tracking.

All numbers are computed from real backend data via the `/api/purchase/*` endpoints —
nothing is hard-coded. Loading, empty and error states are handled throughout.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5178
```
By default it talks to the production Head API. For a local backend, copy
`.env.example` to `.env` and set `VITE_API_URL`.

## Build
```bash
npm run build      # outputs to dist/
```

## Deploy (Vercel)
- Framework preset: **Vite**
- Build command: `npm run build`  ·  Output dir: `dist`
- Add an **SPA rewrite** so client-side routes work on refresh: a `vercel.json`
  with a catch-all rewrite to `/index.html` (or the dashboard's "Rewrite all to
  index.html" setting).
- Optional env var `VITE_API_URL` if you point at a different backend.

## Backend
This portal requires the matching backend changes already added to the Sales Head
backend: the `Purchase Manager` role, the `Vendor` and `PurchaseLine` models, and
the role-guarded `/api/purchase/*` routes. Deploy the Head backend first.

## Accounts
Purchase Manager accounts are created by the Sales Head in
**Settings → Purchase Manager Accounts**.
