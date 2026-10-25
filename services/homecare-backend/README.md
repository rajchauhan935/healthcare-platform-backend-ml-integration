# Emergency & Home Healthcare Backend — Phase 1

Express.js backend for the Home Page & Dashboard API work. Includes project setup, health check, demo authentication/session, role guards, home summary, dashboard summary, validation/error handling, Swagger, tests and Postman collection.

## Requirements
- Node.js 20 LTS or newer
- npm
- PostgreSQL only when integrating the shared database modules; the first demo can run from file-backed mock data.

## Setup (Windows PowerShell)
```powershell
cd path\to\shravan_healthcare_backend
Copy-Item .env.example .env
notepad .env
npm install
npm test
npm run lint
npm run dev
```

Change `JWT_SECRET` in `.env` to a random string of at least 32 characters. Do not commit `.env`. Keep `DASHBOARD_SOURCE=file` until the database schema is confirmed.

## URLs
- Health: `GET http://localhost:4000/api/health`
- Login: `POST http://localhost:4000/api/auth/login`
- Session: `GET http://localhost:4000/api/session/me`
- Home summary: `GET http://localhost:4000/api/home/summary`
- Dashboard summary: `GET http://localhost:4000/api/dashboard/summary`
- Swagger UI: `http://localhost:4000/api/docs/`

## Development-only demo accounts
These are fallback demo identities used when PostgreSQL is not configured, and must never be used in production:
- `patient@demo.test` / `DemoPatient#2026` — patient
- `ops@demo.test` / `DemoOps#2026` — ops
- `admin@demo.test` / `DemoAdmin#2026` — admin

When a database is configured, login reads users from the `users` table. To seed demo users, first confirm Naga's users table contract, then run `npm run seed:demo`. The script stores bcrypt hashes, never plaintext passwords.

## Example requests
Login:
```json
{ "email": "patient@demo.test", "password": "DemoPatient#2026" }
```
Home summary (requires `Authorization: Bearer <token>`):
```http
GET /api/home/summary?lat=26.76&lng=83.37
```
Dashboard summary (ops/admin only):
```http
GET /api/dashboard/summary
```

## Response conventions
Success object: `{ "data": { ... } }`. Errors: `{ "error": { "code": "...", "message": "..." } }`. See Appendix A conventions in the assigned task plan.

## Scripts
- `npm run dev` — nodemon development server
- `npm start` — start server
- `npm test` — Jest + Supertest tests
- `npm run lint` — ESLint
- `npm run format` — Prettier formatting

## Ticket and integration boundaries
Implemented here: BE-01 base skeleton; BE-03 authentication/session baseline; BE-05 home/dashboard summary endpoints; BE-07 baseline security controls; BE-09 file/database provider pattern and fallback.
Not included: teammate-owned database migrations/schema, ambulance/hospital CRUD, booking lifecycle, GPS/location routes, recommendation/ETA AI service integration, production-ready deployment. The DB dashboard query assumes the documented column names; confirm with the database owner before switching to `DASHBOARD_SOURCE=db`.

## Branch / PR workflow
Create a feature branch such as `feature/shravan-be01-setup`, commit only your assigned changes, push the branch and open a PR into `dev`. Do not push directly to `main` or `dev`. Update the API security matrix, Swagger, Postman collection and tests whenever endpoints change.
