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

1. **Clone the Repository:**
   ```powershell
   git clone <repository-url>
   cd customs_idp_backend
   ```

2. **Configure Environment File (`.env`):**
   Create a `.env` file in the project root:
   ```env
   PROJECT_NAME="Portline IDP Engine"
   API_V1_PREFIX="/api/v1"
   SECRET_KEY="your-super-secret-jwt-key"
   
   # Database & Redis Credentials
   POSTGRES_USER=customs
   POSTGRES_PASSWORD=customs
   POSTGRES_DB=customs_idp
   DATABASE_URL="postgresql+asyncpg://customs:customs@db:5432/customs_idp"
   REDIS_URL="redis://redis:6379/0"
   
   # Hugging Face Authentication Token
   HF_TOKEN=hf_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

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