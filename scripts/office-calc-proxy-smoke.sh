#!/bin/sh
# Read-only HTTP smoke for the Office -> Calc same-origin proxy.
# Usage: OFFICE_ORIGIN=https://staging.example.test sh scripts/office-calc-proxy-smoke.sh
# Never submits launch tokens, credentials or writes to application data.
set -eu

: "${OFFICE_ORIGIN:?Set OFFICE_ORIGIN to the HTTPS staging Office origin}"
case "$OFFICE_ORIGIN" in
  https://*) ;;
  *) echo "ERROR: OFFICE_ORIGIN must use HTTPS" >&2; exit 2 ;;
esac
case "$OFFICE_ORIGIN" in
  *'?'*|*'#'*|*'@'*|*' '*)
    echo "ERROR: OFFICE_ORIGIN must be a plain HTTPS origin" >&2; exit 2 ;;
esac
origin="${OFFICE_ORIGIN%/}"
if [ "$origin" != "${origin#https://}" ]; then
  authority="${origin#https://}"
  case "$authority" in
    */*) echo "ERROR: supply origin only, without a path" >&2; exit 2 ;;
  esac
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
check() {
  label="$1"
  path="$2"
  expected="$3"
  # Do not follow redirects: login and router redirects must be visible.
  code="$(curl --silent --show-error --max-time 12 --output "$tmp" --write-out '%{http_code}' "$origin$path")" || {
    echo "FAIL $label: network/TLS error" >&2; return 1;
  }
  case "$expected" in
    200|health|html) [ "$code" = 200 ] ;;
    workbench) [ "$code" = 200 ] || [ "$code" = 302 ] || [ "$code" = 403 ] ;;
    deny) [ "$code" = 401 ] || [ "$code" = 403 ] || [ "$code" = 405 ] || [ "$code" = 503 ] ;;
  esac || {
    echo "FAIL $label: HTTP $code (expected $expected)" >&2; return 1;
  }
  case "$expected" in
    health)
      grep -Eq '"service"[[:space:]]*:[[:space:]]*"brebo-calc"' "$tmp" || {
        echo "FAIL $label: expected Calc health JSON, received other content" >&2; return 1;
      } ;;
    html)
      grep -Eiq '<(!doctype[[:space:]]+html|html)([[:space:]>]|$)' "$tmp" || {
        echo "FAIL $label: expected HTML, received other content" >&2; return 1;
      } ;;
  esac
  echo "PASS $label: HTTP $code"
}
echo "Office Calc read-only proxy smoke: $origin"
check "Calc health via Office origin" "/calc-app/api/health" health
check "Calc UI via Office origin" "/calc-app/" html
check "Office Calc workbench route" "/calc-werkbank" workbench
# Signed Office validation endpoint must not accept an anonymous GET.
check "Grant validation rejects anonymous GET" "/api/workbench/v1/calculation-grants/validate" deny
echo "Read-only route checks passed. Manual browser login, cookies, POST handoff and revocation tests still required."
