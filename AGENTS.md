# AGENTS.md

## Repo Structure

Monorepo with two independent apps:

- **Frontend/** — Angular 16, TypeScript, SCSS, Bootstrap 5. Deploys to GitHub Pages.
- **Backend/** — Flask (Python 3.9+), Supabase, optional Redis. Deploys to Vercel (`vercel dev`).

The Backend's `package.json` is for Vercel dev tooling only — all business logic is in Python.

## Commands

### Frontend (run from `Frontend/`)
```bash
npm install
ng serve              # dev server on localhost:4200
ng build              # production build
ng test               # Karma/Jasmine unit tests
```

### Backend (run from `Backend/`)
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
flask run --debug     # dev server on localhost:5000
# Production: gunicorn app:app
```

### Backend via Vercel (from `Backend/`)
```bash
npm install
vercel dev            # uses the Node.js wrapper
```

## Environment Variables (Backend `.env`)

Required for the backend to function:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/service key |
| `JWT_SECRET` | JWT signing secret (has hardcoded fallback) |
| `REDIS_URL` | Optional — Redis Cloud host |
| `REDIS_PASSWORD` | Optional — Redis password |

## Key Architecture Facts

- **Two auth systems**: Admin login (email/password → JWT) and UPTC Google OAuth (`@uptc.edu.co` only). Tokens stored in separate localStorage keys (`adminToken` vs `buitresToken`).
- **API URL**: Frontend hardcodes `https://api.uptcmusic.com` in `environments/environment.ts`. Change to `http://localhost:5000` for local dev.
- **CORS**: Backend allows only `localhost:4200` and `buitres-uptc-sogamoso.vercel.app`.
- **All API routes are under `/api/`**. Flask serves files from `Backend/uploads/` directly.
- **No lint/typecheck CI** — TypeScript strict mode is on in `tsconfig.json` but there's no `lint` script.
- **Tests**: Frontend has Karma/Jasmine specs (run with `ng test`). Backend has no tests.
- **Image uploads** go to `Backend/uploads/`, optimized by `utils/image_handler.py` (Pillow, max 1024px wide).

## Gotchas

- Backend `app.py` is a single 1275-line file — all routes in one place.
- `JWT_SECRET` has a hardcoded fallback (`846d56ad337d10a3`) — ensure `.env` overrides this in production.
- `.env` loading tries UTF-8 first, falls back to UTF-16 (`app.py:2-5`).
- Frontend uses lazy-loaded components via `loadComponent` in routes — new components must be added to `app.routes.ts`.
- Production build has a tight 2MB budget (`angular.json`).
- `package-lock.json` at root is gitignored but exists in `Frontend/`.
