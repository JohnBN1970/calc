# Office–Calc reverse-proxy prefix contract

**Staging design only. Do not deploy to production without explicit approval.**

The Office browser must use a single HTTPS origin for `/calc-werkbank`, `/calc/start`, `/calc-app/` and `/calc-app/api/launch/consume`. Office's PHP router handles the first two; a **separate web-server reverse-proxy rule** must forward `/calc-app/*` to the Calc Node service. The PHP router does not proxy Node requests.

## Critical prefix invariant

The current Calc API calls `stripCalcBasePath(req.url, CALC_BASE_PATH)` before matching routes. The Vite build uses `VITE_CALC_BASE_PATH` to generate browser asset URLs.

**Recommended staging mode: preserve the full path at the proxy.**

| Layer | Value |
| --- | --- |
| Browser URL | `https://<staging-office-origin>/calc-app/api/health` |
| Reverse proxy forwards upstream path | `/calc-app/api/health` (no prefix stripping) |
| Calc Node environment | `CALC_BASE_PATH=/calc-app` |
| Calc Vite build environment | `VITE_CALC_BASE_PATH=/calc-app` |
| Express route after its own prefix stripping | `/api/health` |
| Calc session cookie Path | `/calc-app` |

**Do not strip `/calc-app` at the reverse proxy AND at the Calc API.** This produces 404s. Also do not build Vite with `/` while serving at `/calc-app/`: browser assets will point to the Office root.

If the hosting platform can only strip the prefix, a different explicitly reviewed Calc configuration is required; do not silently combine the two modes.

## Proxy requirements

- TLS at the public Office origin, valid certificate and correct Host/origin checks for Office POST endpoints.
- Proxy `GET /calc-app/`, `GET /calc-app/assets/*`, `GET /calc-app/api/health`, and `POST /calc-app/api/launch/consume` to the **same** Calc service. Do not proxy `/calc/start`, `/inloggen` or `/crm/*` to Calc.
- Preserve POST method and body, `Cookie` request header, `Set-Cookie` response header, and response status. No caching of session, launch, or HTML responses.
- Calc `Set-Cookie` must remain HttpOnly, SameSite=Lax, Path=/calc-app and Secure when NODE_ENV=production.
- Restrict direct external access to Calc upstream where feasible; otherwise independent public Calc entry points need an explicit security review.
- Apache/LiteSpeed/Hostinger support for proxy rules is **not verified**. Shared hosting may not permit the needed directives. Confirm the supported reverse-proxy facility in staging before changing live routing.

## Read-only verification

Run `OFFICE_ORIGIN=https://<staging-office-origin> sh scripts/office-calc-proxy-smoke.sh` against the staging host only. This checks routes and response identity, **not** cookies, authenticated handoff, replay protection or revocation. Follow with the manual acceptance tests in `docs/OFFICE_CALC_GRANT_ROLLOUT_PREFLIGHT.md`.

**Release blocker:** No verified same-origin proxy, no browser handoff enablement.
