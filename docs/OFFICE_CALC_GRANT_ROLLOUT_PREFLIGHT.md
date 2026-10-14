# Office–Calc grant integration: staging preflight

**Not deployed or enabled. No production authorization.**

## Infrastructure blockers

- Office independent router must serve `/calc-werkbank`, `/calc/start`, `/api/workbench/v1/projects/{id}/calculation-context` and `/api/workbench/v1/calculation-grants/validate`. Existing live `/office` routing is not equivalent to these root paths.
- Office currently does **not** proxy `/calc-app/`. Configure and verify same-origin HTTPS reverse proxy for Calc frontend and API, including POST bodies, cookies, Set-Cookie and path handling, before browser handoff.
- Staging Office database must have reviewed `office_calc_session_grants` migration and active operator/permission/actor/scope data.
- Use matching staging-only Office/Calc shared secret (>=32 bytes).
- Enable Office staging flags together: `OFFICE_CALC_ENABLED`, `OFFICE_CALC_LAUNCH_ENABLED`, `OFFICE_CALC_BROWSER_HANDOFF_ENABLED`, `OFFICE_CALC_CONTEXT_ENABLED`, `OFFICE_CALC_SESSION_GRANTS_ENABLED`, `OFFICE_CALC_GRANT_VALIDATION_ENABLED` (all `enabled`).
- Calc staging: `CALC_BASE_PATH=/calc-app`, `CALC_OFFICE_GRANT_ENFORCEMENT=enabled`, `OFFICE_CALC_GRANT_VALIDATION_URL=https://<staging-office-host>/api/workbench/v1/calculation-grants/validate`. URL must have no query/fragment.

## Acceptance tests

| Case | Expected |
| --- | --- |
| Anonymous browser opens Calc workbench | Office login redirect |
| Authorized calculator opens permitted calculation | Same-origin one-time POST, scoped HttpOnly Calc cookie |
| Replay launch token | Rejected |
| Active grant, correct actor/project/calculation | Protected Calc API allowed |
| Office logout, then Calc API call | 401 |
| Remove calculator permission or project scope | Next Calc API call 401 |
| Office grant endpoint down, malformed or slow | Protected Calc API and new launch denied |
| Missing grant when enforcement enabled | Launch denied before DB writes |
| Legacy cookie without grant | Protected Calc API denied |
| Health endpoint when Office down | Independent health response |

## Production gate

Record staging evidence for routing, browser cookies, replay protection, logout revocation, permission/scope revocation and fail-closed outage. Obtain explicit production go/no-go before deploying, running migrations or switching flags. Do not enable Calc enforcement without Office grant issuance and validation; that would reject every Calc session. While enforcement is disabled, existing standalone Calc sessions are **not** centrally revocable.
