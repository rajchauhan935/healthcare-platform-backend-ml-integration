# Karthik Hospital Portal — Capacity API

## Status

Development contract — provisional.

The endpoints are not yet mounted in the running backend.
Live database integration and hospital ownership verification
are pending schema coordination with Archit.

All examples use synthetic data.

## Objective

Allow authorized hospital users to:

1. Retrieve their own hospital's capacity.
2. Update supported capacity fields.
3. Receive validation errors for invalid updates.
4. Be prevented from accessing or updating another hospital.

## Proposed Endpoints

The final paths require team approval.

### GET /api/hospital-capacity/:hospitalId

Retrieves hospital capacity.

Authentication: Required.

Authorization: The authenticated user's verified hospital
association must match the requested hospital.

Example request:

GET /api/hospital-capacity/H-001

Example response (200):

{
  "hospital": {
    "id": "H-001",
    "name": "Synthetic Test Hospital",
    "icuBedsFree": 5,
    "ventilatorsFree": 2
  }
}

The current repository reads only columns present in the
original hospital migration.

### PATCH /api/hospital-capacity/:hospitalId

Status: Implemented and tested in isolation; not mounted or activated.

PATCH controller, validation, authorization checks and mocked
transaction-based persistence are implemented.

Live persistence remains pending approved schema changes and
trusted hospital-user ownership integration.

Proposed request:

{
  "generalBedsTotal": 100,
  "generalBedsFree": 40,
  "icuBedsTotal": 20,
  "icuBedsFree": 5
}

Proposed fields require database schema approval.

Ventilator updates are excluded until Archit confirms
the appropriate schema and update rules.

## Business Rules

- Capacity values must be non-negative safe integers.
- Available general beds cannot exceed total general beds.
- Available ICU beds cannot exceed total ICU beds.
- Unknown fields are rejected.
- Empty update requests are rejected.
- Partial updates must remain consistent with existing values.
- Users must not update another hospital.

## Proposed HTTP Responses

| Status | Meaning |
|---|---|
| 200 | Successful retrieval or update |
| 400 | Invalid request |
| 401 | Authentication required |
| 403 | Hospital access not verified or forbidden |
| 404 | Hospital not found |
| 500 | Unexpected server error |
| 503 | Persistence or required ownership lookup is not configured |

## Security Requirements

The existing authentication middleware identifies the user
and role, but does not establish hospital ownership.

Hospital ownership must be verified using an agreed,
trusted database relationship before live activation.

A hospitalId supplied by a client must never be accepted
as proof of ownership.

## Database Dependencies

The original hospitals migration contains:

- id
- name
- icu_beds_free
- ventilators_free
- updated_at

The proposed total/general-bed fields do not exist in
that original migration.

Archit must confirm:

1. Final capacity columns.
2. Hospital-user association.
3. Supported update permissions.
4. Existing-data migration strategy.
5. Whether ventilator totals/updates are supported.


## Testing

Completed isolated automated verification:

- Capacity validation and business rules
- Read-only repository tests
- GET controller and HTTP API tests
- PATCH controller and HTTP API tests
- Authentication and cross-hospital security tests
- Trusted hospital ownership middleware tests
- Middleware execution-order tests
- Transaction repository tests
- Transaction rollback and connection cleanup tests

Verification date: 29 October 2026

Test suites: 11 passed / 11 total
Tests: 80 passed / 80 total
Failures: 0

Verification command:

npx jest --runInBand --no-cache --testPathPatterns="hospitalCapacity|hospitalOwnership"

These tests use mocked dependencies and synthetic data.

Pending integration:

- Approved capacity database schema
- Real trusted hospital-user lookup
- Connection of the transaction repository to the approved database
- Integration testing against an approved test database
- Final API route activation

Do not run migrations, seeds or live database writes
without explicit approval.


## API Contract Coordination

The individual assignment suggests GET and PATCH /api/hospital/beds.

The isolated implementation currently proposes
GET and PATCH /api/hospital-capacity/:hospitalId.

These paths are provisional. The final API contract must be
confirmed with the integration team before route activation.

The hospitalId URL parameter identifies the requested resource.
It does not establish authorization or hospital ownership.
