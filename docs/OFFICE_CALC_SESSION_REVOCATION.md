# BREBO Office ↔ Calc — session revocation contract

Status: **design gate, NOT production-ready**. No new endpoint or configuration is enabled by this document.

## Current gap

Calc issues an 8-hour signed `brebo_calc_session` after a valid one-time Office launch. `requireSession()` currently validates the Calc signature and expiry locally. Logging out of Office, disabling an operator, or withdrawing project permission does not automatically invalidate an existing Calc cookie.

## Required security invariant

**Office is the source of truth for operator identity and project/calculation permissions.** A Calc session is valid only while the corresponding Office session and grant remain valid. A signed Calc cookie alone is never sufficient for a privileged read or write.

## Proposed contract (version 1)

- During launch, Office supplies a random, opaque, revocable session reference bound server-side to the Office session, operator, project and calculation. Do **not** place raw Office session cookies, passwords, or database identifiers in the Calc cookie.
- Calc stores only the opaque reference in its signed session and asks a signed, authenticated Office server-to-server authorization endpoint whether the reference is still active for that operator/project/calculation.
- Office answers with an explicit `active: true` only after checking: Office session not expired/revoked, operator active, calculator permission, and current project/calculation scope. Any unknown, revoked or mismatched reference is denied.
- No positive authorization cache for privileged requests unless a bounded stale-access window is explicitly approved. Prefer per-request validation; Office outages/timeouts must fail closed (503/401 as appropriate), never silently allow access.
- Protect the authorization endpoint using a distinct server-to-server credential, fixed destination, strict TLS, request signature with timestamp/nonce, replay rejection, rate limits, and minimal logs. Never log the opaque reference, HMAC secret or session cookie.
- Office logout and permission changes revoke the server-side reference; Calc logout also clears its own cookie. For any state-changing Calc endpoint, verify current Office authorization immediately before the operation.
- Keep session and reference expiration bounded; reject tokens that are validly signed but have missing/legacy references after enforcement is enabled.

## Rollout prerequisites

1. Implement Office issuance, storage, revocation and validation endpoint with automated tests.
2. Extend Calc session schema and enforce Office authorization for all protected API routes; cover reads, writes, uploads and background operations.
3. Verify same-origin Hostinger proxy and `/calc-app` path; do not expose a generic public PHP forwarding proxy.
4. Staging tests: Office logout, operator disable, project grant removal, expired reference, replay, Office timeout, invalid signature, cross-project use, concurrent tabs, and rollback.
5. Activate only after documented production go/no-go. Until then keep Office Calc launch flags disabled.

This document is an implementation contract, not evidence that session revocation is already functional.
