# Core JWT Regression Test Plan

Status: Planning only.

## Existing authentication behavior

- Preserve the existing access-token flow.
- Preserve the existing refresh-token flow.
- Do not change existing authentication secrets.
- Do not change existing database identities.

## Planned regression tests

1. Existing access-token creation and verification.
2. Existing refresh-token creation and verification.
3. Expired access-token rejection.
4. Invalid-signature rejection.
5. Refresh-token separation from access-token verification.
6. Future RS256 access-token compatibility.
7. Audience validation for Booking.
8. Audience validation for Homecare.
9. Central identity must not be treated as a downstream local database ID.

## Safety constraints

- Use temporary test-only credentials and keys.
- Never print generated tokens or keys.
- Do not modify running services during isolated testing.
- Do not claim authenticated end-to-end integration until tested.
