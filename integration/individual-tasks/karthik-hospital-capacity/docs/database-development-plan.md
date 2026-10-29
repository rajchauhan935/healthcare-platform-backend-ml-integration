## Atomic Capacity Update Contract

Status: Proposed - pending schema and team approval.

### Requirements

1. Updates must target the authenticated user's verified hospital only.
2. General and ICU available beds must be nonnegative.
3. Available beds must never exceed their corresponding total.
4. Partial updates must preserve unspecified capacity values.
5. Concurrent updates must not validate against stale capacity.
6. Database constraints must reinforce application validation.
7. A failed update must not leave partially modified capacity data.
8. Ventilator updates remain outside this contract until approved.

### Proposed Transaction Workflow

1. Begin a database transaction.
2. Lock the target hospital capacity row using SELECT ... FOR UPDATE.
3. Read the current capacity values.
4. Merge the requested partial update.
5. Validate the complete resulting capacity.
6. Execute a parameterized UPDATE.
7. Return the updated row.
8. Commit the transaction.

On any failure, roll back the transaction.

### Dependencies

- Approved general and ICU capacity columns.
- Approved hospital-user ownership mapping.
- Confirmed target database and migration plan.
- Team agreement on capacity API routes and permissions.

No migration or live SQL update should run before these dependencies are resolved.
