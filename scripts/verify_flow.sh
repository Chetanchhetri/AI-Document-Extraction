#!/usr/bin/env bash
# End-to-end API walk-through using the seeded demo accounts (needs curl + jq).
#   BASE_URL=http://localhost:8000 DEMO_PASSWORD='Demo-Passw0rd-123' ./scripts/verify_flow.sh
set -euo pipefail
BASE="${BASE_URL:-http://localhost:8000}/api/v1"
PW="${DEMO_PASSWORD:-Demo-Passw0rd-123}"
SAMPLES="$(dirname "$0")/../samples"
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
code() { curl -s -o /tmp/idp_body -w '%{http_code}' "$@"; }
dl() { out="$1"; shift; curl -s -o "$out" -w '%{http_code}' "$@"; }

login() { curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
            -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | jq -r .access_token; }
say "1. Login as executive and manager"
EXEC=$(login executive@customs.example); MGR=$(login manager@customs.example)
[ "$EXEC" != null ] && [ "$MGR" != null ] && echo "tokens issued"

say "2. SHP-24811: export must be LOCKED (422) because of the 45 kg weight mismatch"
SID=$(curl -s "$BASE/shipments?limit=100" -H "Authorization: Bearer $EXEC" | jq '.[] | select(.shipment_code=="SHP-24811") | .id')
echo "HTTP $(code "$BASE/shipments/$SID/export" -H "Authorization: Bearer $EXEC")"; jq -c '.detail.blockers[] | {type, detail}' /tmp/idp_body

say "3. Cross-check evaluation as shown to the reviewer"
curl -s "$BASE/shipments/$SID/review" -H "Authorization: Bearer $EXEC" | jq -c '.cross_checks[] | {id, check_name, status, variance_note}'
CID=$(curl -s "$BASE/shipments/$SID/review" -H "Authorization: Bearer $EXEC" | jq '.cross_checks[] | select(.check_name=="WEIGHT_MATCH_INV_VS_PL") | .id')

say "4. Executive override attempt -> 403; manager override -> 200"
echo "executive: HTTP $(code -X POST "$BASE/shipments/$SID/cross-checks/$CID/override" -H "Authorization: Bearer $EXEC" -H 'Content-Type: application/json' -d '{"override_reason":"Pallet weight confirmed"}')"
echo "manager:   HTTP $(code -X POST "$BASE/shipments/$SID/cross-checks/$CID/override" -H "Authorization: Bearer $MGR" -H 'Content-Type: application/json' -d '{"override_reason":"Pallet weight confirmed with supplier"}')"

say "5. Export SHP-24811 now succeeds"
echo "HTTP $(dl /tmp/SHP-24811.xlsx "$BASE/shipments/$SID/export" -H "Authorization: Bearer $EXEC")" ; ls -l /tmp/SHP-24811.xlsx | awk '{print $5" bytes -> /tmp/SHP-24811.xlsx"}'

say "6. Upload a fresh triad (AI_PROVIDER=mock returns canned data mirroring SHP-24811)"
NEW=$(curl -s -X POST "$BASE/shipments" -H "Authorization: Bearer $EXEC" -H 'Content-Type: application/json' -d '{"supplier_name":"Company B (China)"}')
NID=$(echo "$NEW" | jq .id); echo "created $(echo "$NEW" | jq -r .shipment_code)"
for T in invoice packing_list bill_of_lading; do
  echo "$T: HTTP $(code -X POST "$BASE/shipments/$NID/documents" -H "Authorization: Bearer $EXEC" -F "doc_type=$T" -F "file=@$SAMPLES/$T.pdf;type=application/pdf")"
done
sleep 2
REVIEW=$(curl -s "$BASE/shipments/$NID/review" -H "Authorization: Bearer $EXEC")
echo "$REVIEW" | jq -c '{status: .shipment.status, export_ready, blockers: [.export_blockers[] | .type]}'
echo "$REVIEW" | jq -c '.cross_checks[] | {check_name, status, variance_note}'

say "7. Human verification: correct the invoice weight (audit-logged) and verify the low-confidence field"
GW=$(echo "$REVIEW" | jq '[.documents[].fields[] | select(.field_name=="gross_weight_kg")][0].id')
INC=$(echo "$REVIEW" | jq '[.documents[].fields[] | select(.field_name=="incoterms")][0].id')
echo "edit weight: HTTP $(code -X PATCH "$BASE/shipments/$NID/fields/$GW" -H "Authorization: Bearer $EXEC" -H 'Content-Type: application/json' -d '{"value":"3165"}')"
echo "verify incoterms: HTTP $(code -X PATCH "$BASE/shipments/$NID/fields/$INC" -H "Authorization: Bearer $EXEC" -H 'Content-Type: application/json' -d '{"is_human_verified":true}')"

say "8. Export the new shipment"
echo "HTTP $(dl /tmp/new-shipment.xlsx "$BASE/shipments/$NID/export" -H "Authorization: Bearer $EXEC")"

say "9. SHP-24812 single-click verification, HSN suggestion and analytics"
S2=$(curl -s "$BASE/shipments?limit=100" -H "Authorization: Bearer $EXEC" | jq '.[] | select(.shipment_code=="SHP-24812") | .id')
echo "verify-all: $(curl -s -X POST "$BASE/shipments/$S2/verify-all" -H "Authorization: Bearer $EXEC" | jq -r .message)"
echo "export:     HTTP $(dl /tmp/SHP-24812.xlsx "$BASE/shipments/$S2/export" -H "Authorization: Bearer $EXEC")"
curl -s -X POST "$BASE/hsn/suggest" -H "Authorization: Bearer $EXEC" -H 'Content-Type: application/json' -d '{"description":"LED panel light 40W"}' | jq -c '.[0]'
curl -s "$BASE/analytics/accuracy" -H "Authorization: Bearer $MGR" | jq -c '.by_supplier[]'
