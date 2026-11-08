# AI-Powered Document Extraction & Verification System

An enterprise-grade document extraction, cross-checking, and analytics platform designed for logistics, trade, and shipment documentation (Invoices, Bills of Lading, Packing Lists, Customs Declarations). 

The platform leverages Vision AI models for intelligent OCR and field extraction, vector embeddings for automated HSN (Harmonized System Nomenclature) code classification, and an automated cross-checker engine (Gatekeeper) for discrepancy verification across multi-document shipment packages.

---

## Architecture Overview

```
                          ┌──────────────────────────┐
                          │   Portline React UI      │
                          └────────────┬─────────────┘
                                       │ REST / API
                                       v
                          ┌──────────────────────────┐
                          │    FastAPI Gateway       │
                          └──────┬────────────┬──────┘
                                 │            │
            ┌────────────────────┘            └────────────────────┐
            v                                                      v
┌───────────────────────┐                                ┌───────────────────┐
│   PostgreSQL DB       │                                │   Redis Cache /   │
│ (Metadata & Audit)    │                                │   Task Queue      │
└───────────────────────┘                                └─────────┬─────────┘
                                                                   │
                                                                   v
                                                         ┌───────────────────┐
                                                         │ Vision AI &       │
                                                         │ Embedding Engine  │
                                                         └───────────────────┘
```

---

## Core Features

- **Vision-Based Document Extraction:** High-accuracy field extraction from unstructured trade documents using vision-capable models.
- **Multi-Document Cross-Checking:** Automated discrepancy detection across shipment files (e.g., verifying quantities, values, consignee details between Invoices and Bills of Lading).
- **HSN Classification & Embedding Search:** Semantic search and automated mapping of HSN codes using vector embeddings.
- **Role-Based Access Control (RBAC):** Granular authorization and user management for compliance and auditability.
- **Data Encryption at Rest & In Transit:** Sensitive document metadata and payload data are encrypted securely using cryptography modules.
- **Async Task Queue:** Background processing via Redis for long-running OCR and vector generation tasks.
- **Export & Reporting:** Export audit logs, document summaries, and compliance reports to Excel (`.xlsx`) or JSON.

---

## Project Structure

```
.
├── alembic/                  # Database migration scripts
│   └── versions/             # Migration versions
├── app/
│   ├── api/
│   │   ├── deps.py           # Dependency injection (Auth, DB session)
│   │   └── v1/               # API Router and Endpoints
│   │       └── endpoints/    # Auth, Documents, Review, Shipments, HSN, Analytics
│   ├── core/                 # App configurations, security, DB, Redis, logging
│   ├── models/               # SQLAlchemy ORM models
│   ├── schemas/              # Pydantic validation schemas
│   ├── services/             # Business logic (Vision, Embeddings, Cross-Checker, Mail)
│   ├── tasks/                # Async task execution (Background OCR & processing)
│   └── main.py               # FastAPI application entry point
├── portline-frontend/        # React + Vite frontend dashboard
├── Dockerfile                # Production Dockerfile for backend service
├── docker-compose.yml        # Multi-container orchestrations (App, DB, Redis)
└── alembic.ini               # Database migration configuration
```

---

## Technology Stack

- **Backend:** Python 3.10+, FastAPI, Pydantic, SQLAlchemy 2.0, Alembic
- **Frontend:** React, Vite, Tailwind CSS
- **Database & Cache:** PostgreSQL, Redis
- **AI / Data Science:** OpenAI / Vision APIs, Vector Embeddings, NumPy/Pandas
- **Security:** PyJWT, Passlib (Bcrypt), Cryptography Fernet Engine
- **Containerization:** Docker, Docker Compose

---

## Getting Started

### Prerequisites

Ensure you have the following installed locally:
- **Python 3.10+**
- **Node.js 18+** & `npm` / `yarn`
- **Docker & Docker Compose** (Optional but recommended for full stack local setup)
- **PostgreSQL 14+** & **Redis 6+** (If running without Docker)

---

### Local Environment Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd AI-Document-Extraction
   ```

2. **Backend Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   PROJECT_NAME="AI Document Extraction API"
   API_V1_STR="/api/v1"
   SECRET_KEY="your-super-secret-key-change-in-production"
   ENCRYPTION_KEY="your-fernet-encryption-key"
   
   # Database
   POSTGRES_SERVER=localhost
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=doc_extraction_db
   POSTGRES_PORT=5432
   
   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   
   # AI / Model Keys
   VISION_MODEL_API_KEY="your-api-key"
   ```

3. **Backend Setup & Migrations:**
   ```bash
   # Create virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate

   # Install dependencies
   pip install -r requirements.txt

   # Run Database Migrations
   alembic upgrade head

   # Start FastAPI Server
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. **Frontend Setup:**
   ```bash
   cd portline-frontend
   npm install
   npm run dev
   ```

5. **Access Application:**
   - **Frontend UI:** `http://localhost:5173`
   - **API Documentation (Swagger):** `http://localhost:8000/docs`
   - **Alternative Docs (ReDoc):** `http://localhost:8000/redoc`

---

## Docker Deployment (Local Quickstart)

To spin up the entire ecosystem (Backend, PostgreSQL, Redis) with a single command:

```bash
docker-compose up -d --build
```

Run Alembic migrations inside the container:
```bash
docker-compose exec app alembic upgrade head
```

---

## API Documentation Highlights

- `POST /api/v1/auth/login` - Authenticate user & obtain OAuth2 JWT token.
- `POST /api/v1/documents/upload` - Upload multi-format shipping documents for parsing.
- `POST /api/v1/shipments/` - Manage shipment packages and trigger cross-checks.
- `POST /api/v1/review/` - Human-in-the-loop review and verification of extracted fields.
- `GET /api/v1/hsn/search` - Semantic search for HSN codes and classification.
- `GET /api/v1/analytics/dashboard` - Metrics on document processing speed, accuracy, and audit trends.
- `GET /api/v1/export/excel` - Download verified shipment data in formatted Excel workbooks.

---

## License & Support

Internal Enterprise Application - Proprietary. All rights reserved.