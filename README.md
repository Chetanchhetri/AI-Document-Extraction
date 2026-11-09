# Portline IDP - AI-Powered Document Extraction & Verification System

An enterprise-grade Intelligent Document Processing (IDP), multi-shipment cross-checking, and comparative analytics platform built for customs brokers, freight forwarders, and logistics teams. 

Portline IDP leverages **Vision AI** for document field extraction, vector embeddings for automated HSN (Harmonized System Nomenclature) classification, and a locally hosted **Gemma 2 (2B Instruction-Tuned)** LLM engine to power the **AI Copilot**, HSN suggestions, and multi-supplier variance analysis.

---

## Architecture Overview

```
                          ┌────────────────────────────────┐
                          │     Portline React Dashboard   │
                          │   (Copilot UI, Compare & Auth) │
                          └───────────────┬────────────────┘
                                          │ REST / JSON
                                          v
                          ┌────────────────────────────────┐
                          │   FastAPI Gateway (Uvicorn)    │
                          │ (Non-Blocking Lifespan Loading)│
                          └───────┬──────────────┬─────────┘
                                  │              │
            ┌─────────────────────┘              └─────────────────────┐
            v                                                          v
┌───────────────────────┐                                    ┌───────────────────┐
│     PostgreSQL 16     │                                    │   Redis 7 Cache   │
│ (Metadata & Audit)    │                                    │   & Session Store │
└───────────────────────┘                                    └───────────────────┘
                                                                       │
                                                                       v
                                                             ┌───────────────────┐
                                                             │ Local Gemma 2 2B  │
                                                             │  (Host Cache Vol) │
                                                             └───────────────────┘
```

---

## Key Features

- **Local Gemma 2 (2B) AI Copilot:** Instant, privacy-first context-aware Q&A on shipment documents using `google/gemma-2-2b-it`.
- **Compare & Analyze Workspace:** Multi-shipment and supplier variance auditing with discrepancy scoring and automated summary generation.
- **Vision-Based Document Extraction:** Structured parsing of Invoices, Bills of Lading, Packing Lists, and Customs Declarations.
- **Multi-Document Gatekeeper Cross-Checking:** Automated reconciliation across documents to flag line-item mismatches, weight variances, and currency inconsistencies.
- **HSN Classification & Semantic Search:** Fast lookup and mapping of customs tariff codes via vector embeddings.
- **Host-Mounted Cache Architecture:** Reuses pre-downloaded Hugging Face cache directories (`${USERPROFILE}/.cache/huggingface`) directly inside Docker to eliminate repeated model downloads.
- **Non-Blocking Application Lifespan:** Deferral of heavy PyTorch model initialization to background threads after Uvicorn startup completes, maintaining instant login, CORS compatibility, and system responsiveness.

---

## Project Structure

```
.
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── api.py                    # Consolidated API Router
│   │       └── endpoints/
│   │           ├── auth.py               # Authentication & User Management
│   │           ├── copilot.py            # AI Copilot & Compare Endpoints
│   │           ├── documents.py          # Document Upload & Parsing
│   │           ├── hsn.py                # HSN Code Search & Suggestions
│   │           ├── llm_routes.py         # LLM Interface Routes
│   │           └── shipments.py          # Shipment Management & Audit
│   ├── core/
│   │   ├── config.py                     # App Settings & Environment Parsing
│   │   ├── database.py                   # Async SQLAlchemy Session Engine
│   │   └── redis.py                      # Redis Client & Token Store
│   ├── services/
│   │   ├── llm_service.py                # Gemma 2 2B PyTorch & Transformers Engine
│   │   ├── vision_service.py             # Vision AI Document Parser
│   │   └── cross_checker.py              # Automated Multi-Document Gatekeeper
│   └── main.py                           # FastAPI Entrypoint & Async Lifespan Manager
├── portline-frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.jsx                 # Refined Login UI with Metrics & Feature Cards
│   │   │   ├── NewSection.jsx            # AI Copilot Chat Interface
│   │   │   └── CompareWorkspace.jsx      # Multi-Shipment Variance & Report Generator
│   │   ├── api.js                        # Standardized Axios/Fetch Client Configuration
│   │   └── App.jsx                       # Main Application Shell & Routing
├── docker-compose.yml                    # Multi-Container Deployment Orchestration
└── Dockerfile                            # FastAPI Container Build Definition
```

---

## Technology Stack

- **Backend Framework:** FastAPI, Uvicorn, AsyncIO
- **AI & Data Science:** PyTorch, Hugging Face Transformers (`google/gemma-2-2b-it`), NumPy, Pandas
- **Frontend Framework:** React 18, Vite, Tailwind CSS, Lucide Icons
- **Database & Storage:** PostgreSQL 16 (AsyncPG), Redis 7
- **Authentication & Security:** OAuth2, JWT, Passlib (Bcrypt), PyJWT
- **Containerization:** Docker Engine, Docker Compose

---

## Getting Started

### Prerequisites

- **Docker Desktop** (with WSL2 enabled on Windows)
- **Node.js 18+** & `npm` (for local frontend development)
- **Hugging Face Account & User Access Token (`HF_TOKEN`)** with access granted for `google/gemma-2-2b-it`.

---

### Environment Setup
# ---- Core ------------------------------------------------------------------------------

ENVIRONMENT=development                 # development | production (production enforces strong secrets, hides /docs)
ENABLE_DOCS=true                        # Swagger UI at /docs (ignored in production)
CORS_ORIGINS=http://localhost:3000      # comma separated; empty = CORS disabled
LOG_LEVEL=INFO

# ---- Data stores -----------------------------------------------------------------------
# docker-compose overrides these two; for local non-docker runs adjust to your instances.
DATABASE_URL=postgresql+asyncpg://customs:customs@localhost:5432/customs_idp   # postgres:// and postgresql:// also accepted (Render)
REDIS_URL=redis://localhost:6379/0      # memory:// = in-process fallback (dev/tests ONLY; refused in production)
AUTO_CREATE_TABLES=false                # true = create_all() on boot (dev shortcut). Normal path: Alembic (run by start.sh)

# ---- Secrets (generate real ones!) ------------------------------------------------------
# python -c "import secrets; print(secrets.token_urlsafe(48))"
SECRET_KEY=change-me-change-me-change-me-change-me-0123456789
# 32-byte key as 64 hex chars or base64; any other string >= 32 chars is HKDF-derived. NEVER change it once PII is stored.
# python -c "import secrets; print(secrets.token_hex(32))"
AES_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# ---- Bootstrap -------------------------------------------------------------------------
SUPERADMIN_EMAIL=TEST@example.com
SUPERADMIN_INIT_PASSWORD= TestPassword@123    
SEED_DEMO_DATA=False                    
SEED_DEMO_PASSWORD=Demo-Passw0rd-123    (verified)

# ---- Auth tuning (defaults match the spec) ----------------------------------------------
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
OTP_TTL_SECONDS=600
AUTH_RATE_LIMIT_MAX=5                   # per IP per window on login / verify-otp / resend-otp (and signup)
AUTH_RATE_LIMIT_WINDOW_SECONDS=900

# ---- SMTP (OTP e-mail) ------------------------------------------------------------------
# Empty SMTP_HOST in development => the OTP is written to the API log instead of being e-mailed.
# Render FREE blocks outbound ports 25/465/587 -> use a provider with port 2525 (Brevo, Mailgun, SendGrid...).
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER= Email
SMTP_PASSWORD= SMPT PASSWORD
SMTP_FROM= Email
SMTP_STARTTLS=true

EMAIL_SENDER= Email
EMAIL_PASSWORD= SMPT PASSWORD

# ---- Uploads ---------------------------------------------------------------------------
UPLOAD_DIR=./storage                    # ephemeral on Render free (no disk)
MAX_UPLOAD_BYTES=26214400               # 25 MB
MAX_PDF_PAGES=50
AI_MAX_PAGES=3                          # pages rendered and sent to the vision model per document
AI_RENDER_DPI=110                       # bounding boxes are reported in pixels at this DPI

# ---- AI --------------------------------------------------------------------------------
# mock   : offline canned extraction mirroring SHP-24811 (demo / CI). Real documents are NOT read.
# gemini : Gemma via the Google AI Studio (Gemini) API  -> free tier, but see data-use warning in DEPLOYMENT.md
# ollama : fully local Gemma 3 vision + EmbeddingGemma -> private, needs a machine with a GPU/16GB RAM
AI_PROVIDER=mock
AI_EXTRA_HEADERS='{"X-Zero-Data-Retention": "true", "Cache-Control": "no-store"}'
GEMINI_API_KEY=
GEMINI_VISION_MODEL= gemma-3-27b-it
GEMINI_EMBED_MODEL= gemini-embedding-001
OLLAMA_BASE_URL= http://localhost:11434
OLLAMA_VISION_MODEL= gemma3:4b
OLLAMA_EMBED_MODEL= embeddinggemma
LOW_CONFIDENCE_THRESHOLD= 0.85
HSN_MIN_SCORE= 0.35

   # Hugging Face Authentication Token

HF_TOKEN = HF_TOKEN_FROM_HUGGING_FACE

---

### Local Docker Startup

Spin up the entire system including PostgreSQL, Redis, and the FastAPI engine:

```powershell
docker compose up -d --build
```

**Boot Process Verification:**
```powershell
docker compose logs -f api
```

The system will display:
```text
INFO: Application startup complete.
INFO: Uvicorn running on http://0.0.0.0:8000
INFO app.services.llm_service: Attempting local cache load for model 'google/gemma-2-2b-it'...
INFO app.services.llm_service: Model 'google/gemma-2-2b-it' loaded successfully from local host cache.
```

---

## API Documentation

Access the interactive API interfaces once the backend is running:
- **Swagger Interactive UI:** `http://localhost:8000/docs`
- **ReDoc Schema View:** `http://localhost:8000/redoc`

### Primary Endpoint Highlights

- `POST /api/v1/auth/login` - User authentication & OAuth2 JWT token issue.
- `POST /api/v1/copilot/chat` - Prompt local Gemma 2 (2B) model with document context.
- `POST /api/v1/copilot/compare` - Audit variances across multiple shipments/suppliers.
- `POST /api/v1/documents/upload` - Ingest multi-page shipping invoices and manifests.
- `GET /api/v1/shipments/{id}/review` - Retrieve gatekeeper verification status and extracted fields.

---

## License

Internal Enterprise Application. All rights reserved.