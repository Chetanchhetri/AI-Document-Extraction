# Customs IDP Backend - Deployment Guide

FastAPI (async) + SQLModel + PostgreSQL + Redis. Designed to run entirely on **free tiers**.

> **Read first - three free-tier realities (verified against Render/Google docs, Nov 2026)**
> 1. **AI:** Gemma 2 *Vision* and "EmbeddingGemma 2" are not hosted free anywhere with the exact names in the brief. The code ships a pluggable engine: `mock` (offline demo), `gemini` (Gemma 3 vision + Gemini embeddings through Google AI Studio's free tier) and `ollama` (fully local Gemma 3 vision + EmbeddingGemma). **Google's free tier may use your prompts to improve its products - do not send real customer shipment documents through it.** For real data use `ollama` on your own machine, or a paid Gemini tier.
> 2. **Render free plan:** web service sleeps after 15 min idle, has an **ephemeral filesystem** (uploaded originals vanish on redeploy/restart/sleep; extracted data stays in Postgres), free **Postgres expires after 30 days**, free **Key Value is in-memory** (a restart logs everyone out and drops pending OTPs), and **outbound SMTP ports 25/465/587 are blocked** - use an SMTP provider that offers **port 2525**.
> 3. **Memory:** free instances are small (256-512 MB). Argon2 is tuned to 19 MiB, DB pool to 3+2, one uvicorn worker, and only the first `AI_MAX_PAGES` pages are rendered for the model.

---
## 1. Local setup (Docker)

```bash
cp .env.example .env            # then edit secrets (see section 2)
docker compose up --build       # Postgres 16 + Redis 7 + API on http://localhost:8000
```
The API container runs `alembic upgrade head`, seeds the super admin, and (because `SEED_DEMO_DATA=true` in `.env.example`) seeds the demo shipments. Swagger UI: http://localhost:8000/docs (development only). Health: `GET /health`.

Optional fully-local AI: `docker compose --profile local-ai up --build`, then
`docker compose exec ollama ollama pull gemma3:4b && docker compose exec ollama ollama pull embeddinggemma` and set `AI_PROVIDER=ollama`.

Without Docker: `pip install -r requirements.txt`, start your own Postgres/Redis, set `.env`, run `alembic upgrade head && uvicorn app.main:app --reload`. For a zero-dependency try-out use `REDIS_URL=memory://` and `DATABASE_URL=sqlite+aiosqlite:///./dev.db` with `AUTO_CREATE_TABLES=true` (needs `requirements-dev.txt`).

Run the tests: `pip install -r requirements-dev.txt && pytest` (SQLite + in-memory Redis by default; set `DATABASE_URL`/`REDIS_URL` to run them on Postgres/Redis).

## 2. Environment file (`.env.example`)

| Variable | Purpose |
|---|---|
| `ENVIRONMENT` | `production` enforces strong secrets, forbids `memory://` Redis, hides `/docs`. |
| `DATABASE_URL` | Postgres URL. `postgres://`/`postgresql://` (Render) are auto-converted to `postgresql+asyncpg://`. |
| `REDIS_URL` | OTPs, JWT blacklist/token families, rate limiting. `memory://` = dev/tests only. |
| `SECRET_KEY` | JWT signing + OTP HMAC. >= 32 random chars (`python -c "import secrets;print(secrets.token_urlsafe(48))"`). |
| `AES_ENCRYPTION_KEY` | AES-256-GCM key for PII (64 hex chars / 32-byte base64; any other >= 32-char string is HKDF-derived). **Never change after PII is stored - existing ciphertext becomes unreadable.** |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_INIT_PASSWORD` | Auto-seeded super admin if none exists (Argon2id-hashed). Change the password after first login. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | OTP mail. Empty host in development logs the OTP (`[DEV ONLY]`) instead. |
| `SEED_DEMO_DATA`, `SEED_DEMO_PASSWORD` | Seed SHP-24811/24812 on boot (for hosts with no shell, e.g. Render free); password creates `manager@`/`executive@customs.example`. Keep off in real production. |
| `AI_PROVIDER` + `GEMINI_*` / `OLLAMA_*` | See the AI notes above. `AI_EXTRA_HEADERS` are sent on every AI call (zero-retention hints for gateways/proxies; they are *not* enforced by Google's free tier). |
| `AUTH_RATE_LIMIT_MAX / _WINDOW_SECONDS` | 5 requests / 900 s per IP on login, verify-otp, resend-otp (and signup). |

## 3. Migrations and seeding

```bash
docker compose exec api alembic upgrade head      # already run by scripts/start.sh on every boot
docker compose exec api python -m seed.seed_data  # idempotent
```
Seeds: **SHP-24811** (Company B, China - Invoice 3120 kg vs PL 3165 kg => `WEIGHT_MATCH_INV_VS_PL` FAILED, export returns 422 until a manager overrides or an executive corrects the weight), **SHP-24812** (Company C, Sweden - all checks passed; one low-confidence field so you can try single-click `verify-all`), plus two historical shipments so `/hsn/suggest` and analytics have data. HSN codes in the seed are illustrative sample data.

New migration after model changes: `alembic revision --autogenerate -m "msg"`.

## 4. Render production deployment (free plans)

1. Push this folder to GitHub. In Render: **New > Blueprint**, pick the repo (it reads `render.yaml`: free web service from the Dockerfile + free Postgres + free Key Value, wired together; `SECRET_KEY`/`AES_ENCRYPTION_KEY` are generated).
2. When prompted, fill the `sync: false` secrets: `SUPERADMIN_EMAIL`, `SUPERADMIN_INIT_PASSWORD`, `SMTP_*` (port **2525**), `GEMINI_API_KEY` (only if `AI_PROVIDER=gemini`).
3. Manual alternative: create Postgres (Free), Key Value (Free), and a Web Service (Docker, Free); set `DATABASE_URL` and `REDIS_URL` to the **Internal** connection strings plus the variables from section 2. Health check path: `/health`.
4. The container runs migrations on each start (Render's free plan has no pre-deploy command or shell). To load demo data temporarily set `SEED_DEMO_DATA=true` (+ `SEED_DEMO_PASSWORD`), deploy once, then set it back to `false`.
5. Remember: Postgres expires in 30 days (export with `pg_dump` or upgrade), first request after sleep takes ~30-60 s, and uploaded originals are not persisted (review viewer returns HTTP 410 for them). For real use move to a paid instance with a disk or add S3 storage.

## 5. API verification flow (curl)

Automated version: `BASE_URL=http://localhost:8000 DEMO_PASSWORD='<SEED_DEMO_PASSWORD>' ./scripts/verify_flow.sh` (needs `jq`). Manual steps (`B=http://localhost:8000/api/v1`):

```bash
# a) Signup (role is forced to executive; a body containing "role" is rejected with 422) + OTP
curl -X POST $B/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"Str0ngPassw0rd","full_name":"Me"}'
docker compose logs api | grep "OTP for"            # dev only: OTP is logged when SMTP_HOST is empty
curl -X POST $B/auth/verify-otp -H 'Content-Type: application/json' -d '{"email":"me@example.com","otp":"123456"}'

# b) Login (seeded users work too) -> access + refresh tokens
EXEC=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"executive@customs.example","password":"<SEED_DEMO_PASSWORD>"}' | jq -r .access_token)
MGR=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"manager@customs.example","password":"<SEED_DEMO_PASSWORD>"}' | jq -r .access_token)

# c) Create a shipment and upload the PDF triad (python scripts/make_sample_pdfs.py creates ./samples)
SID=$(curl -s -X POST $B/shipments -H "Authorization: Bearer $EXEC" -H 'Content-Type: application/json' \
  -d '{"supplier_name":"Company B (China)"}' | jq .id)
for T in invoice packing_list bill_of_lading; do
  curl -X POST $B/shipments/$SID/documents -H "Authorization: Bearer $EXEC" \
    -F doc_type=$T -F "file=@samples/$T.pdf;type=application/pdf"; done

# d) Cross-check evaluation + side-by-side review data (fields, confidence, bounding boxes, blockers)
curl -s $B/shipments/$SID/review -H "Authorization: Bearer $EXEC" | jq '.cross_checks, .export_blockers'
curl -i $B/shipments/$SID/export -H "Authorization: Bearer $EXEC"          # HTTP 422 while blockers exist

# e) Human verification: edit (audit-logged) or verify a field
curl -X PATCH $B/shipments/$SID/fields/<FIELD_ID> -H "Authorization: Bearer $EXEC" \
  -H 'Content-Type: application/json' -d '{"value":"3165"}'                   # or {"is_human_verified":true}
curl -X POST $B/shipments/$SID/verify-all -H "Authorization: Bearer $EXEC"    # single-click verification

# f) Manager override of a failed check (reason >= 10 chars; executives get 403)
curl -X POST $B/shipments/$SID/cross-checks/<CHECK_ID>/override -H "Authorization: Bearer $MGR" \
  -H 'Content-Type: application/json' -d '{"override_reason":"Pallet weight confirmed with supplier"}'

# g) Export Excel, HSN suggestion, analytics, logout
curl -o SHP.xlsx $B/shipments/$SID/export -H "Authorization: Bearer $EXEC"
curl -X POST $B/hsn/suggest -H "Authorization: Bearer $EXEC" -H 'Content-Type: application/json' -d '{"description":"LED panel light 40W"}'
curl $B/analytics/accuracy -H "Authorization: Bearer $MGR"
curl -X POST $B/auth/logout -H "Authorization: Bearer $EXEC"
```

## 6. Design notes and deliberate deviations from the brief

* **AES-256-GCM:** the brief also names `cryptography.fernet`, which is AES-128-CBC+HMAC. PII uses `AESGCM` (256-bit key, random nonce, field name as AAD) instead.
* **PII fields** (`importer_/exporter_` contact name, email, phone) are encrypted in `extracted_fields`, masked (`J**n D*e`, `+91-******1234`) in audit rows, and redacted from application logs.
* **Zero retention** cannot be guaranteed by headers alone; it comes from choosing `ollama` or a paid/zero-retention provider tier.
* **Override route:** implemented both `/cross-checks/{check_id}/override` and `/cross-checks/override` (id in body).
* **Schema additions:** `audit_logs.extracted_field_id` is nullable and gains `cross_check_id`, `shipment_id` (so overrides/exports are audited); `documents` gains `sha256`, `page_count`, `extraction_status/_error`; line-item `embedding` stores `{model, vector}`. Weight checks are `INV_VS_PL` and `PL_VS_BL`; extra checks: `MATH_LINE_ITEMS_VS_INVOICE_TOTAL`, `PACKAGE_COUNT_MATCH`.
* **Background work** uses FastAPI background tasks in-process (no separate worker, which would not be free); Redis is used for auth state and rate limiting. If extraction output is unparsable, a cleanup prompt is tried, then blank low-confidence fields are created for manual keying. Manual entry of *line items* is not implemented - a manager override covers a failed math check.
* **Deduplication** is SHA-256 per shipment; semantic duplicate detection with embeddings is not implemented. `pandas` is not used (memory). HSN search is cosine similarity in Python over JSON vectors (fine for thousands of rows; move to pgvector beyond that).
* **PDF safety:** magic bytes, 25 MB streamed cap, page/geometry limits, encrypted PDFs refused, JavaScript/embedded files/links/AcroForm/OpenAction stripped and the file rewritten; images are size-checked from headers before decoding. Not a substitute for an AV scan in high-risk settings.
* **Token model:** 15-min access / 7-day refresh, one-time refresh rotation per family with reuse detection, logout blacklists the access JTI and kills the family, role/deactivation changes revoke all of a user's tokens.
* Bounding boxes are integer pixels at `AI_RENDER_DPI` (default 110), origin top-left, page 1-based (`bbox_reference` in the review payload). Models are imprecise at pixel boxes - treat them as hints.
