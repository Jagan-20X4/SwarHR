# SwarHR security notes

## Trust boundary

- **The API enforces authentication and authorization.** React route guards (`ProtectedRoute`) only improve UX; they are not a security control.
- Never rely on hiding UI or client-side `localStorage` role flags to protect data.

## Authentication

- Session JWT is stored in an **HttpOnly** cookie (`swar_token`), not readable by JavaScript.
- Optional legacy `Authorization: Bearer` header is still accepted for tooling.
- HR and candidate tokens expire after **24 hours** by default (`JWT_EXPIRES_HR_SEC`, `JWT_EXPIRES_CAND_SEC`).

## HR-only operations

- Candidate password reset: `POST /api/candidates/:id/reset-password` (HR JWT).
- Anthropic proxy (HR tools): `POST /api/messages` (HR JWT only).
- Voice interview AI follow-ups: `POST /api/interview/messages` (candidate JWT + active `applicationId`).
- Bulk state save: `PUT /api/state` with `saveCandidates: false` only (no full DB truncate).

## Production checklist

- Set `JWT_SECRET`, `CORS_ORIGINS`, `NODE_ENV=production`.
- Run `database/migration_performance_indexes.sql`.
- Set `REGISTRATION_ENABLED=false` unless public signup is required.
- Rotate `VOICE_BOT_SERVICE_TOKEN`; optional `VOICE_BOT_ALLOWED_IPS`.
