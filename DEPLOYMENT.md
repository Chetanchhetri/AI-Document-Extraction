# Production Deployment Guide

This document outlines standard procedures for deploying, configuring, and maintaining the **AI-Powered Document Extraction Platform** in production environments.

---

## System Requirements

### Hardware / Resource Recommendations

| Component | Minimum | Recommended (Production) |
| :--- | :--- | :--- |
| **CPU** | 2 vCPU | 4+ vCPU |
| **RAM** | 4 GB | 8 - 16 GB |
| **Storage** | 20 GB SSD | 100+ GB NVMe SSD |
| **Network** | 100 Mbps | 1 Gbps |

---

## Architecture Topology

In a production environment, deployment is divided into:
1. **Application Container (FastAPI + Uvicorn)**
2. **Database (Managed PostgreSQL Instance / Cloud SQL)**
3. **Cache & Worker Broker (Managed Redis Cluster)**
4. **Reverse Proxy / Load Balancer (NGINX / AWS ALB / Traefik)**
5. **Static Frontend (Vite Build hosted on CDN/Nginx)**

---

## Environment Configuration

Ensure the following production environment variables are properly populated in your deployment secret manager or `.env` file:

```env
# Application Settings
ENVIRONMENT=production
DEBUG=false
PROJECT_NAME="AI Document Processing Engine"
API_V1_STR="/api/v1"
ALLOWED_HOSTS=["https://your-domain.com"]

# Security & Credentials
SECRET_KEY="<generate-256-bit-secure-random-string>"
ENCRYPTION_KEY="<fernet-key-for-data-at-rest>"
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Database Configuration (PostgreSQL)
POSTGRES_SERVER="db.your-cloud-provider.internal"
POSTGRES_USER="db_admin"
POSTGRES_PASSWORD="<strong-database-password>"
POSTGRES_DB="document_extraction_prod"
POSTGRES_PORT=5432
SQLALCHEMY_DATABASE_URI="postgresql://db_admin:<password>@db.your-cloud-provider.internal:5432/document_extraction_prod"

# Redis Cache & Broker
REDIS_HOST="redis.your-cloud-provider.internal"
REDIS_PORT=6379
REDIS_PASSWORD="<secure-redis-password>"

# Vision & AI API Credentials
VISION_MODEL_API_KEY="<production-vision-api-key>"
EMBEDDINGS_MODEL_API_KEY="<production-embedding-api-key>"

# Mail Service
SMTP_SERVER="smtp.sendgrid.net"
SMTP_PORT=587
SMTP_USER="apikey"
SMTP_PASSWORD="<smtp-api-key>"
EMAIL_FROM="noreply@your-domain.com"
```

---

## Containerized Deployment with Docker

### 1. Build Production Image

The application uses a optimized Dockerfile. Build the production image:

```bash
docker build -t app-document-extraction:v1.0.0 .
```

### 2. Multi-Container Orchestration (`docker-compose.prod.yml`)

Create a production compose configuration:

```yaml
version: '3.8'

services:
  app:
    image: app-document-extraction:v1.0.0
    restart: always
    env_file:
      - .env.production
    ports:
      - "8000:8000"
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./portline-frontend
      dockerfile: Dockerfile
    restart: always
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - app
```

### 3. Executing Migrations

Before launching traffic to the new release, execute Alembic migrations:

```bash
docker-compose -f docker-compose.prod.yml run --rm app alembic upgrade head
```

---

## Reverse Proxy Setup (NGINX Example)

Configure NGINX as an edge proxy to terminate TLS/SSL and route requests to backend service workers:

```nginx
server {
    listen 80;
    server_name api.your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;

    client_max_body_size 50M; # Accommodate high-resolution PDF uploads

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Security & Operational Checklist

- [ ] **Data Encryption:** Verify Fernet `ENCRYPTION_KEY` is loaded in secret store and not committed to git.
- [ ] **SSL/TLS:** Enforce TLS 1.2+ on all external endpoints.
- [ ] **Rate Limiting:** Enable rate limiting at NGINX or gateway layer to prevent denial-of-service on Vision extraction endpoints.
- [ ] **Database Connection Pooling:** Set maximum pool size according to worker count (`pool_size=20`, `max_overflow=10`).
- [ ] **Log Retention:** Forward application logs (`JSON` formatted via `app/core/logging.py`) to a central collector (e.g., Datadog, ELK, AWS CloudWatch).

---

## Maintenance & Database Backups

### Automated PostgreSQL Backup Script
Run daily cron jobs to backup metadata and extracted entities:

```bash
pg_dump -U db_admin -h db.your-cloud-provider.internal document_extraction_prod | gzip > /backups/db_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Zero-Downtime Migration Process
1. Deploy updated backend codebase to staging.
2. Run non-destructive database migrations (`alembic upgrade head`).
3. Deploy new application containers.
4. Verify `/health` endpoints.
5. Decommission older containers.