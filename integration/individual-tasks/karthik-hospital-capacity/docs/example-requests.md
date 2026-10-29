# Karthik Hospital Portal — Example API Requests

## Status

Provisional examples for development and review.

These endpoints are not mounted in the running backend yet.
All hospital IDs, user IDs and capacity values below are synthetic.

The final endpoint paths, database schema and hospital-user
ownership mechanism require team approval.

## 1. GET Hospital Capacity

Request:

GET /api/hospital-capacity/H-001

Authentication:

Authorization: Bearer <synthetic-token-placeholder>

Expected successful response — HTTP 200:

{
  "hospital": {
    "id": "H-001",
    "name": "Synthetic Test Hospital",
    "icuBedsFree": 5,
    "ventilatorsFree": 2
  }
}

Note: The current read-only repository retrieves fields supported
by the original hospital migration.

## 2. PATCH Hospital Capacity

Request:

PATCH /api/hospital-capacity/H-001

Content-Type: application/json

Example JSON body:

{
  "generalBedsFree": 35
}

Proposed successful response — HTTP 200:

{
  "hospital": {
    "id": "H-001",
    "name": "Synthetic Test Hospital",
    "generalBedsTotal": 100,
    "generalBedsFree": 35,
    "icuBedsTotal": 20,
    "icuBedsFree": 5
  }
}

The proposed total/general-bed fields require schema approval.
This response is currently demonstrated using mocked persistence.

## 3. Invalid Capacity

PATCH /api/hospital-capacity/H-001

{
  "generalBedsFree": 101
}

If the existing general-bed total is 100:

Expected HTTP 400:

{
  "error": "Invalid hospital capacity",
  "details": [
    "General beds available capacity cannot exceed total capacity"
  ]
}

## 4. Negative Capacity

PATCH /api/hospital-capacity/H-001

{
  "icuBedsFree": -1
}

Expected HTTP 400.

Negative capacity values must be rejected.

## 5. Empty Update

PATCH /api/hospital-capacity/H-001

{}

Expected HTTP 400.

At least one supported capacity field is required.

## 6. Unauthenticated Request

GET /api/hospital-capacity/H-001

Without valid authentication:

Expected HTTP 401.

## 7. Cross-Hospital Request

A user verified for hospital H-001 requests:

PATCH /api/hospital-capacity/H-002

{
  "icuBedsFree": 4
}

Expected HTTP 403.

No database update must occur.

## 8. Hospital Not Found

A verified hospital request targets a hospital record that
does not exist.

Expected HTTP 404.

## 9. Persistence Not Configured

A PATCH request reaches a controller without an approved
persistence implementation.

Expected HTTP 503:

{
  "error": "Hospital capacity updates are not configured"
}

## Important

These examples are documentation and mocked-test scenarios,
not evidence of a functioning live database integration.

Do not send requests using real hospital or patient data
until the schema, authorization and integration are approved.
