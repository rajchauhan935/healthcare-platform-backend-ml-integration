# API Security Matrix (owned routes)

| Method | Path | Public | Allowed roles | Body/query/params validation |
|---|---|---|---|---|
| GET | `/api/health` | Yes | All | None |
| POST | `/api/auth/login` | Yes | All | JSON: email, password |
| GET | `/api/session/me` | No | patient, ops, admin | Bearer JWT |
| GET | `/api/home/summary` | No | patient, ops, admin | Optional `lat` and `lng` together |
| GET | `/api/dashboard/summary` | No | ops, admin | Bearer JWT |

## Security controls
- JWT bearer authentication and role guards are centralized in `src/middleware/auth.js`.
- Login limiter: 10 attempts / 15 minutes / IP outside tests.
- General API limiter: 100 requests / minute / IP outside tests.
- Helmet headers, CORS origin allow-list, request IDs and JSON body limit are enabled.
- Error responses do not include stack traces. Authorization headers and passwords are not explicitly logged.
- Summary cache TTL: home 5 seconds; dashboard 10 seconds.
- Shared ambulance/booking/hospital/location routes must be added to this matrix when the database owner's PR is integrated.
