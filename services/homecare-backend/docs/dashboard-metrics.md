# Dashboard Metrics

The response contract is fixed in `src/services/dashboardService.js`.

- `emergencyCountToday`: non-cancelled bookings created since midnight IST.
- `activeAmbulances`: ambulances with `available` or `busy` status.
- `hospitalsAvailable`: hospitals with `icu_beds_free > 0`.
- `avgResponseMinutes`: average ETA for today's non-cancelled bookings, rounded to one decimal; uses file value if there are no matching rows.
- `priorityAlerts`: alert objects with `high`, `medium`, or `low` level.
- `emergenciesByHour`: exactly 24 entries, hours 0 through 23 in IST, with missing hours set to zero.
- `generatedAt`: ISO-8601 timestamp.

## Provider switching
Set `DASHBOARD_SOURCE=file` to use `mock-data/dashboard_summary.json` (default), or `DASHBOARD_SOURCE=db` to try the PostgreSQL provider. If the DB provider fails, it logs a warning and falls back to the validated JSON file.

## Integration caveat
The SQL provider assumes Naga's schema exposes `bookings.created_at`, `bookings.status`, `bookings.eta_minutes`, `ambulances.status`, `hospitals.icu_beds_free`. Confirm actual names and joins with the database owner before enabling `DASHBOARD_SOURCE=db`. The priority-alert thresholds and alert text should be agreed with Raj before final demo.
