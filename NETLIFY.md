# Netlify deploy (single deploy, Option A)

The existing Express app (`server.js`) runs inside a Netlify Function
(`netlify/functions/server.js` via `serverless-http`). Pages, static assets
and `/api/*` are served together; `vercel.json` is left untouched.

## Settings (manual steps in the Netlify dashboard)

- Build command: `npm install`
- Publish directory: `.` (repo root serves `design.css`, `responsive.css`, screens)
- Functions directory: `netlify/functions`
- Environment variables:
  - `SUPABASE_URL` (e.g. `https://xyzcompany.supabase.co`)
  - `SUPABASE_ANON_KEY` (e.g. `eyJh...O4dM` — paste the full key, never commit it)

## How routing works (`netlify.toml`)

- `/api/*` -> `/.netlify/functions/server/:splat` (200, forced): API via Express.
- `/` -> `/.netlify/functions/server` (200, forced): landing serves the PRO
  reference page (`bienvenido`), not the orphan `index.html` at the repo root.
- `/*` -> `/.netlify/functions/server` (200): pages with no static file fall
  through to Express. Existing static files keep CDN serving; Express is fallback.

## Verify after deploy

- `GET /` returns the PRO welcome page (not the orphan landing).
- `GET /seleccion-rol` and `GET /estudiante/dashboard` return 200 (previously 404
  on Netlify because `server.js` never ran).
- `GET /api/test-db` returns `{"message":"Supabase OK",...}` when env vars are
  set, or `503 {"error":"Supabase not configured"}` when they are missing.
- Static check: `GET /design.css` and `GET /responsive.css` return 200.
