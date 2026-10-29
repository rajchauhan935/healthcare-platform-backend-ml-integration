# Karthik Hospital Portal - Test Plan

## Status

Isolated development testing completed.
Live database and authorization integration pending.

Use synthetic data only.

## 1. Capacity Validator

Verify that the validator:

- Accepts valid non-negative integer counts.
- Rejects negative values.
- Rejects decimal values.
- Rejects unknown fields.
- Rejects empty requests.
- Rejects available capacity greater than total capacity.
- Accepts available capacity equal to total capacity.
- Rejects negative total capacity.

## 2. Capacity Service

Verify that the service:

- Accepts valid partial updates.
- Rejects general-bed availability exceeding total.
- Rejects ICU availability exceeding total.
- Rejects reducing a total below existing availability.
- Accepts consistent simultaneous updates.
- Rejects negative and unsupported values.
- Rejects missing existing capacity.

## 3. Repository

Use a mocked query function to verify:

- Repository initialization.
- Existing hospital retrieval.
- Missing hospital handling.
- Invalid hospital ID rejection.
- Parameterized SQL.

These tests do not establish live database compatibility.

## 4. GET Controller and API

Verify:

- Valid synthetic authorized request.
- Missing hospital ID.
- Missing verified hospital ownership.
- Cross-hospital access rejection.
- Hospital not found.
- Repository failure.
- Unauthenticated HTTP request.

## 5. PATCH Controller and API

Verify:

- Valid partial capacity update.
- Negative or inconsistent capacity rejection.
- Empty request rejection.
- Cross-hospital update rejection.
- Missing verified ownership rejection.
- Hospital not found.
- Persistence not configured.
- Repository failure.

All PATCH persistence used in these tests is mocked.

## 6. Pending Integration Tests

After schema and ownership approval, verify:

- Authentication with the existing middleware.
- Trusted server-side hospital-user association.
- Correct role permissions.
- Retrieval of persisted capacity.
- Valid updates persist and can be retrieved.
- Invalid updates do not change database records.
- A user cannot update another hospital.
- Concurrent updates preserve capacity constraints.
- Missing hospital and database errors are handled.
- Existing backend routes continue working.

## 7. Release Conditions

Do not mark the individual task complete until:

- Archit approves the final capacity schema.
- The original database situation is resolved.
- Hospital ownership is verified server-side.
- Capacity updates are atomic and persistent.
- Live integration tests pass using synthetic records.
- The final API contract is approved.
- The implementation is reviewed through the agreed team workflow.

Do not execute migrations, seeds, or database writes without
explicit approval.
