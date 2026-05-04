# SwarHR

Frontend (`frontend/`) and backend (`backend/`). **PostgreSQL** stores jobs, candidates (passwords hashed), CV files (base64 in `TEXT`), transcripts, analyses, talent pool, audit log, DPO settings, and HR users. **No JSONB** — relational tables only (`database/schema.sql`).

Anthropic calls still go through **`POST /api/messages`**; the API key stays in **`backend/.env`**.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

## 1. Database

Create a database and apply the schema (includes seed data):

```bash
createdb swarhr
psql -U postgres -d swarhr -f database/schema.sql
```

Or use pgAdmin / any client to run `database/schema.sql`.

**Existing database already created from an older `schema.sql`:** apply incremental DDL so interview scheduling/cooling columns exist:

```bash
psql -U postgres -d swarhr -f database/migration_application_interview_columns.sql
```

### Seed logins (after running `schema.sql`)

| Role | Identifier | Password |
|------|------------|----------|
| Candidate | `john@example.com` | `password123` |
| HR | `HR-TM-001` | `hrpassword123` |
| HR | `ADMIN` | `adminpass123` |

## 2. Backend `.env`

Use **either** a single URI **or** separate fields (recommended for AWS RDS).

**Option A — `DATABASE_URL`**

```
DATABASE_URL=postgresql://USER:PASSWORD@host.region.rds.amazonaws.com:5432/SwarHR
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

**Option B — `PG_*` (RDS or local)**

```
PG_HOST=your-db.region.rds.amazonaws.com
PG_PORT=5432
PG_DATABASE=SwarHR
PG_USER=aideveloper
PG_PASSWORD=your-secret-password
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

SSL to RDS is turned **on automatically** when `PG_HOST` ends with `.rds.amazonaws.com`. Override with `PG_SSL=true` or `PG_SSL=false`. For stricter certificate verification, set `PG_SSL_REJECT_UNAUTHORIZED=true` (you may need the RDS CA bundle).

Do **not** commit real passwords; keep them only in **`backend/.env`** (already gitignored via `.env`).

## 3. Install & run

**Terminal 1 — backend**

```bash
cd backend
npm install
npm start
```

**Terminal 2 — frontend**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**. The UI loads **`GET /api/state`** and saves changes with **`PUT /api/state`** (debounced). Candidate passwords are **never** returned from the API; login uses **`POST /api/auth/candidate/login`** and **`POST /api/auth/hr/login`**.

## Project layout

| Path | Purpose |
|------|---------|
| `database/schema.sql` | DDL + seed data |
| `backend/server.js` | Express: state API, auth, Anthropic proxy |
| `backend/stateRepo.js` | Load/save normalized state |
| `frontend/` | Vite + `index.html` React app |

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| `503` / DATABASE_URL | `backend/.env` and PostgreSQL running |
| Login fails | Run `schema.sql`; use seed passwords above |
| Save errors | Backend console; large CVs need `express.json` limit (already 50mb) |
