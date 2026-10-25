# Phase 3 - Shared Authentication Integration Boundary

Status: Isolated prototype only. Not deployed.

## Demonstrated by isolated tests

- Existing Core access and refresh JWT behavior has regression coverage.
- An isolated Core RS256 access-token issuer is compatible with the shared verifier.
- Booking and Homecare have separate token audiences.
- Invalid signatures and incorrect audiences are rejected.
- An isolated identity resolver requires explicit central-to-local account mapping.
- Missing, inactive and cross-service mappings are rejected.

## Not yet implemented or demonstrated

- No RS256 issuer has replaced the running Core authentication strategy.
- Booking and Homecare have not adopted the shared verifier.
- No persistent central-to-local identity mapping has been implemented.
- No authenticated cross-service end-to-end test has passed.
- No production signing-key storage, rotation or revocation workflow has been established.
- No production security or clinical-readiness claim is made.

## Required integration sequence

1. Design secure signing-key management and rotation.
2. Implement Core access-token migration while preserving refresh-token behavior.
3. Implement explicit account-linking storage and lifecycle controls.
4. Integrate audience-specific verification into Booking and Homecare.
5. Resolve verified central subjects to authorized local accounts.
6. Add authorization, negative-case and authenticated end-to-end tests.
7. Review rollback, monitoring and deployment controls.

Do not equate a central subject with a downstream database ID.
Do not activate the prototype solely because isolated tests pass.
