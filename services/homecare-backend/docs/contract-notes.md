# Contract notes / team handover

- API JSON keys use camelCase; database columns use snake_case.
- Roles: `patient`, `ops`, `admin`.
- Success object: `{ "data": { ... } }`; error object: `{ "error": { "code": "...", "message": "..." } }`.
- Dashboard keys: `emergencyCountToday`, `activeAmbulances`, `hospitalsAvailable`, `avgResponseMinutes`, `priorityAlerts`, `emergenciesByHour`, `generatedAt`.
- Confirm the exact `users` ID type and shared database schema with the project lead before enabling SQL integration.
- Emergency contact numbers are sample values from the task plan and should be verified before demo.
