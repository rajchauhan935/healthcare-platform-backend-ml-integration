# Five-minute demo (local development)

1. Copy `.env.example` to `.env`; set `JWT_SECRET` to a random value of at least 32 characters. Keep `DASHBOARD_SOURCE=file` for the first demo.
2. Run `npm install`, then `npm test`, then `npm run dev`.
3. Open `http://localhost:4000/api/docs/` and show the OpenAPI documentation.
4. Call `GET /api/health`; show status, time, uptime and version.
5. Login using the development patient account in README; copy the returned token into the Postman `token` variable.
6. Call `GET /api/session/me` and `GET /api/home/summary` with the token.
7. Login as ops and call `GET /api/dashboard/summary`; show the 24 hourly buckets.
8. Demonstrate a missing token (401) and patient access to dashboard (403).

Use fake data only. Do not use demo passwords outside local development. Database-driven dashboard metrics and the complete booking flow require the shared database/booking/location PRs to be merged.
