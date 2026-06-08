# SwarHR Frontend (React + Vite)

Production React app migrated from the monolithic `index.legacy.html` (5k-line Babel-in-browser bundle).

## Quick start

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000 — proxies /api → backend :3001
npm run build        # outputs to dist/
```

Copy `.env.example` to `.env` and set `VITE_PUBLIC_APP_URL` for production invite links.

## Architecture

```
src/
├── main.tsx                 # Entry: providers, pdfjs, mammoth, Tailwind
├── App.tsx                  # Root layout + AppRoutes
├── app/
│   ├── bootstrap/           # Runtime env (CLAUDE_API_URL, etc.)
│   ├── providers/           # AuthProvider, QueryProvider
│   ├── router/              # routes.tsx, pathUtils, ProtectedRoute, GuestRoute
│   ├── state/               # AppStateProvider (shared app state + handlers)
│   ├── pages/               # Route page components
├── features/                # 35 components split by domain (see split:components)
│   ├── auth/
│   ├── jobs/
│   ├── hr/
│   ├── interview/
│   ├── talent-pool/
│   └── ...
├── shared/                  # API client, utils, types
├── domain/                  # Pure business logic
├── constants/
├── legacy/
│   ├── LegacyApp.jsx        # Fallback copy of monolith (no longer imported)
│   └── rawApp.jsx           # Extracted script body
└── styles/
```

## Migration scripts

| Script | Command |
|--------|---------|
| Re-extract from legacy HTML | `npm run extract:legacy` (needs `index.legacy.html`) |
| Split into feature files | `npm run split:components` |

## Current state

- **Running:** `AppStateProvider` + dedicated React Router v6 routes + split feature components
- **Auth:** `ProtectedRoute` (candidate / HR), `GuestRoute` (login / register), `AuthenticatedRoute` (interview)
- **Routes:** `/`, `/login`, `/register`, `/portal`, `/jobs/:jobId/apply`, `/hr/*`, `/cv-analyser`, `/interview`, `/talent-pool`
- **Next:** Wire TanStack Query to `jobsApi` / `meApi`; remove `@ts-nocheck` from features incrementally

## Backend

Start backend on port 3001 (`cd backend && npm start`). Vite dev server proxies `/api`.
