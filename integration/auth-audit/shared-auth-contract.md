# Shared Authentication Contract — Draft v1

Status: DESIGN ONLY — NOT IMPLEMENTED

## Proposed architecture

- Core backend is the central identity authority.
- Booking and Homecare retain separate databases.
- Downstream services accept only appropriately scoped access tokens.
- Refresh tokens remain restricted to Core authentication workflows.
- The Gateway forwards Authorization headers without inventing identity.
- A central identity must not be treated as a local database ID.

## Proposed access-token requirements

- Stable central subject (`sub`)
- Explicit issuer (`iss`)
- Explicit audience (`aud`)
- Issued-at (`iat`) and expiration (`exp`)
- Explicit token type
- Defined role/authorization semantics
- Explicit permitted signing algorithm
- Signature, issuer, audience and expiry validation

## Current status

Existing JWT implementations have not yet been unified.
Existing authentication must remain unchanged until implementation
and regression tests are prepared.

## Confirmed existing implementation findings

### Core
- Uses separate access and refresh JWT operations.
- Access-token payload references `sub` and `role`.
- Authentication service references a user lookup by ID.

### Booking
- JWT middleware reads `decoded.sub` and `decoded.role`.
- Constructs `req.user` with `id` and `role`.
- Verification code references an algorithm option.

### Homecare
- JWT middleware reads `payload.sub` and `payload.role`.
- Constructs `req.user` with `id` and `role`.

### Integration
- Missing and invalid tokens currently produce HTTP 401
  on the tested protected Gateway routes.
- Valid cross-service authenticated workflows remain untested.

## Implementation safeguards

1. Preserve the verified pre-shared-auth checkpoint.
2. Do not expose or print JWT secrets, passwords, OTPs or tokens.
3. Do not copy a JWT secret between existing services as a shortcut.
4. Do not assume matching numeric IDs identify the same person.
5. Keep existing service databases separate.
6. Reject missing, malformed, expired and incorrectly scoped tokens.
7. Use an explicit central-to-local identity mapping where required.
8. Keep existing endpoints working during migration.
9. Add automated authentication regression tests.
10. Verify rollback before considering the integration complete.

## Pending design decisions

- Exact signing and verification mechanism
- Token issuer and audience identifiers
- Central-to-local account linking
- Role and permission mapping
- Migration of existing local login endpoints
- Token revocation and refresh behaviour
