# Phase 4 - Core RS256 Migration Plan

Status: Planning only. Not activated.

## Objective

Migrate Core access-token issuance toward centrally issued,
audience-specific RS256 access tokens.

Preserve existing functionality until replacement behavior is
fully tested and an explicit migration decision is made.

## Requirements

1. Preserve the existing Core refresh-token behavior.
2. Keep signing private keys out of source control.
3. Never expose private keys to Booking or Homecare.
4. Verify issuer, audience, signature, expiry and token type.
5. Use separate Booking and Homecare audiences.
6. Require explicit central-to-local identity mapping.
7. Do not treat central subjects as local database IDs.
8. Maintain a tested rollback procedure.

## Implementation sequence

1. Review existing Core token issuance call sites.
2. Establish secure key-loading and validation interfaces.
3. Add isolated issuer regression tests.
4. Prepare an adapter without replacing existing JWT behavior.
5. Test both supported audiences.
6. Test invalid keys, invalid audiences and expired tokens.
7. Integrate only after a verified rollback checkpoint.
8. Add authenticated end-to-end tests before declaring success.

## Current boundary

The RS256 issuer and shared verifier are isolated prototypes.
The running authentication services have not been migrated.
