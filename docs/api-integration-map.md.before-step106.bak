# Health Platform API Integration Map

## Local Services

| Service | Address |
|---|---|
| Own Backend | http://127.0.0.1:3000 |
| Kartik Backend | http://127.0.0.1:4001 |
| Ma'am Backend | http://127.0.0.1:4000 |
| Ujala Recommendation | http://127.0.0.1:8001 |
| Shreya ETA | http://127.0.0.1:8002 |
| Integration Gateway | http://127.0.0.1:5000 |

## Proposed Gateway Routes

| Gateway Prefix | Destination |
|---|---|
| /api/core/* | Own Backend /api/v1/* |
| /api/bookings/* | Kartik Backend /api/bookings/* |
| /api/booking-auth/* | Kartik Backend /api/auth/* |
| /api/booking-ambulances/* | Kartik Backend /api/ambulances/* |
| /api/booking-hospitals/* | Kartik Backend /api/hospitals/* |
| /api/homecare/* | Ma'am Backend /api/* |
| /api/recommendation | Ujala POST /recommend |
| /api/eta | Shreya POST /eta |

## Security Rules

- Preserve authentication and authorization in each original backend.
- Do not share JWT secrets between services.
- Do not expose database credentials through the gateway.
- Do not bypass protected routes.
- Do not merge the three original databases.
- Gateway forwarding must be restricted to explicitly approved routes.
- Production authentication for Ma'am backend remains pending.

## Known Limitation

Shreya's ETA service currently uses baseline fallback because its saved
machine-learning model is incompatible with the installed scikit-learn version.

## Integration Status

- Five original services: health checks passed.
- Gateway: health check passed.
- Gateway-to-service health verification: 5/5 passed.
- Functional API forwarding: not implemented yet.
- Full end-to-end workflow: not verified yet.
