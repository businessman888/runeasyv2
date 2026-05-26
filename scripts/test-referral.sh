#!/usr/bin/env bash
# End-to-end smoke test for the Referral system against a deployed backend.
# Usage:
#   BASE_URL=https://app.runeasy.com.br \
#   USER_ID=<uuid> \
#   REVENUECAT_WEBHOOK_SECRET=<secret> \
#   bash scripts/test-referral.sh
#
# Tests run in order. Stops on first hard failure unless CONTINUE_ON_ERROR=1.

set -u

: "${BASE_URL:?BASE_URL is required}"
: "${USER_ID:?USER_ID is required}"
# WEBHOOK secret is optional — tests 7/8 are skipped if missing.
WEBHOOK_SECRET="${REVENUECAT_WEBHOOK_SECRET:-}"

PASS=0
FAIL=0
RESULTS=()

# Pretty colors (no-op if not a TTY)
if [ -t 1 ]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
else
    GREEN=''; RED=''; YELLOW=''; CYAN=''; NC=''
fi

# Unique suffix per run so webhook event ids don't collide with previous runs.
RUN_ID="$(date +%s)"

call() {
    local method="$1"; local path="$2"; local body="${3:-}"; local extra_header="${4:-}"
    local tmp; tmp="$(mktemp)"
    local status
    if [ -n "$body" ]; then
        status=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "${BASE_URL}${path}" \
            -H "Content-Type: application/json" \
            -H "x-user-id: ${USER_ID}" \
            ${extra_header:+-H "$extra_header"} \
            -d "$body")
    else
        status=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "${BASE_URL}${path}" \
            -H "x-user-id: ${USER_ID}" \
            ${extra_header:+-H "$extra_header"})
    fi
    BODY="$(cat "$tmp")"
    STATUS="$status"
    rm -f "$tmp"
}

assert() {
    local label="$1"; local expected_status="$2"; local jq_check="${3:-}"
    local ok=1
    if [ "$STATUS" != "$expected_status" ]; then ok=0; fi
    if [ -n "$jq_check" ] && [ "$ok" = "1" ]; then
        if ! echo "$BODY" | grep -Eq "$jq_check"; then ok=0; fi
    fi
    if [ "$ok" = "1" ]; then
        printf "${GREEN}\xE2\x9C\x93 PASS${NC} %s\n" "$label"
        printf "       status=%s body=%s\n" "$STATUS" "$BODY"
        PASS=$((PASS+1))
        RESULTS+=("PASS|$label")
    else
        printf "${RED}\xE2\x9C\x97 FAIL${NC} %s\n" "$label"
        printf "       expected status=%s pattern=%s\n" "$expected_status" "$jq_check"
        printf "       got      status=%s body=%s\n" "$STATUS" "$BODY"
        FAIL=$((FAIL+1))
        RESULTS+=("FAIL|$label")
        if [ "${CONTINUE_ON_ERROR:-0}" != "1" ]; then
            echo
            echo "${RED}Stopping at first failure. Set CONTINUE_ON_ERROR=1 to override.${NC}"
            summary; exit 1
        fi
    fi
}

summary() {
    echo
    printf "${CYAN}========== SUMMARY ==========${NC}\n"
    printf "Passed: ${GREEN}%d${NC}   Failed: ${RED}%d${NC}\n" "$PASS" "$FAIL"
    for r in "${RESULTS[@]}"; do
        echo "  $r"
    done
}

webhook_event() {
    local evt_id="$1"; local evt_type="$2"; local price="$3"
    cat <<EOF
{
  "event": {
    "id": "${evt_id}",
    "type": "${evt_type}",
    "app_user_id": "${USER_ID}",
    "product_id": "monthly_pro",
    "purchased_at_ms": 1716638400000,
    "expiration_at_ms": 1719230400000,
    "period_type": "NORMAL",
    "price": ${price},
    "currency": "BRL"
  }
}
EOF
}

echo "${CYAN}Running referral smoke tests against ${BASE_URL}${NC}"
echo "User: ${USER_ID}"
echo "Run id: ${RUN_ID}"
echo

# ---- TEST 1: validate valid code ----
echo "${YELLOW}[1/10] validate('TESTE') → expect valid:true${NC}"
call POST /api/referral/validate '{"code":"teste"}'
assert "T1 validate valid code" 200 '"valid"[[:space:]]*:[[:space:]]*true'

# ---- TEST 2: validate invalid code ----
echo
echo "${YELLOW}[2/10] validate('INEXISTENTE') → expect valid:false${NC}"
call POST /api/referral/validate '{"code":"INEXISTENTE"}'
assert "T2 validate invalid code" 200 '"valid"[[:space:]]*:[[:space:]]*false'

# ---- TEST 4: apply valid code (creates referrals row) ----
echo
echo "${YELLOW}[3/10] apply('TESTE') → expect applied:true${NC}"
call POST /api/referral/apply '{"code":"teste"}'
assert "T4 apply valid code" 200 '"applied"[[:space:]]*:[[:space:]]*true'

# ---- TEST 5: apply again → 409 ----
echo
echo "${YELLOW}[4/10] apply('TESTE') again → expect HTTP 409${NC}"
call POST /api/referral/apply '{"code":"teste"}'
assert "T5 second apply rejected" 409 ''

# ---- TEST 6: status reflects the new referral ----
echo
echo "${YELLOW}[5/10] status → expect has_referral:true${NC}"
call GET /api/referral/status
assert "T6 status has_referral=true" 200 '"has_referral"[[:space:]]*:[[:space:]]*true'

if [ -z "$WEBHOOK_SECRET" ]; then
    echo
    echo "${YELLOW}Skipping tests 7-8 (REVENUECAT_WEBHOOK_SECRET not provided)${NC}"
else
    AUTH_HEADER="Authorization: Bearer ${WEBHOOK_SECRET}"

    # ---- TEST 7: INITIAL_PURCHASE → first commission row ----
    echo
    echo "${YELLOW}[6/10] webhook INITIAL_PURCHASE → expect handled:true (month 1)${NC}"
    call POST /api/webhooks/revenuecat "$(webhook_event "evt_test_${RUN_ID}_1" INITIAL_PURCHASE 24.90)" "$AUTH_HEADER"
    assert "T7 INITIAL_PURCHASE webhook processed" 200 '"handled"[[:space:]]*:[[:space:]]*true'

    # ---- TEST 8a: RENEWAL #1 → month 2 ----
    echo
    echo "${YELLOW}[7/10] webhook RENEWAL #1 → expect month 2${NC}"
    call POST /api/webhooks/revenuecat "$(webhook_event "evt_test_${RUN_ID}_2" RENEWAL 24.90)" "$AUTH_HEADER"
    assert "T8a RENEWAL #1 processed" 200 '"handled"[[:space:]]*:[[:space:]]*true'

    # ---- TEST 8b: RENEWAL #2 → month 3 ----
    echo
    echo "${YELLOW}[8/10] webhook RENEWAL #2 → expect month 3${NC}"
    call POST /api/webhooks/revenuecat "$(webhook_event "evt_test_${RUN_ID}_3" RENEWAL 24.90)" "$AUTH_HEADER"
    assert "T8b RENEWAL #2 processed" 200 '"handled"[[:space:]]*:[[:space:]]*true'

    # ---- TEST 8c: RENEWAL #3 → must NOT create a 4th commission ----
    echo
    echo "${YELLOW}[9/10] webhook RENEWAL #3 → expect 200 but commission capped (no 4th row)${NC}"
    call POST /api/webhooks/revenuecat "$(webhook_event "evt_test_${RUN_ID}_4" RENEWAL 24.90)" "$AUTH_HEADER"
    assert "T8c RENEWAL #3 returns 200 (no extra commission row inside)" 200 '"handled"[[:space:]]*:[[:space:]]*true'
fi

# ---- TEST 3: rate limit on validate (LAST — blocks user for 1h after) ----
# Tests 1 + 2 already consumed 2 of the 10-per-hour quota for this user.
# Loop 9 more times: the 9th call should be the one that crosses the limit
# (cumulative 11th attempt) and return HTTP 429.
if [ "${SKIP_RATE_LIMIT:-0}" = "1" ]; then
    echo
    echo "${YELLOW}Skipping test 3 (SKIP_RATE_LIMIT=1)${NC}"
else
    echo
    echo "${YELLOW}[10/10] rate limit on validate → expect 429 within 9 extra attempts${NC}"
    echo "${YELLOW}        (WARNING: locks user_id out of /referral/validate for ~1h)${NC}"
    saw_429=0
    for i in $(seq 1 9); do
        call POST /api/referral/validate '{"code":"teste"}'
        if [ "$STATUS" = "429" ]; then
            printf "       attempt #%d returned 429 — rate limit hit\n" "$i"
            saw_429=1
            break
        else
            printf "       attempt #%d: status=%s\n" "$i" "$STATUS"
        fi
    done
    if [ "$saw_429" = "1" ]; then
        printf "${GREEN}\xE2\x9C\x93 PASS${NC} T3 rate limit triggers 429\n"
        PASS=$((PASS+1)); RESULTS+=("PASS|T3 rate limit triggers 429")
    else
        printf "${RED}\xE2\x9C\x97 FAIL${NC} T3 rate limit did not trigger after 11 cumulative attempts\n"
        FAIL=$((FAIL+1)); RESULTS+=("FAIL|T3 rate limit did not trigger")
    fi
fi

summary
exit $FAIL
