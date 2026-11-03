# Portline — Customs Document Intelligence

Portline is a desktop-first customs documentation workspace for freight forwarders and customs brokers. It supports shipment intake, invoice / packing-list / bill-of-lading upload, AI extraction review, confidence-based human verification, cross-document checks, and a gated filing export.

## Product and design direction

The interface uses a restrained graphite / ivory palette rather than a full-page blue treatment:

- **Light mode:** soft ivory canvas, white surfaces, charcoal text, quiet stone borders, and a sea-glass teal action color.
- **Dark mode:** low-glare graphite surfaces, warm green undertones, soft text contrast, and a muted jade action color.
- **Semantic colors:** amber for attention and low confidence, emerald for verified / passed, and red for blocking errors.
- **Typography:** Inter for the interface and JetBrains Mono for shipment references, identifiers, and numeric values.
- Theme preference is persisted in browser local storage and can be switched from the login screen or application header.

## Stack

- React 18 + Vite
- Tailwind CSS 3
- Radix UI primitives styled in the Shadcn UI component pattern
- Lucide React icons
- FastAPI v1 REST API adapter
- Node's built-in test runner for core gatekeeper tests

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. The API base URL defaults to `http://localhost:8000`; the login screen also exposes API connection settings. For a separate frontend/backend origin, configure FastAPI CORS for the frontend origin.

Build and preview:

```bash
npm run build
npm run preview
```

Run tests:

```bash
npm test
```

## Authentication and demo

Use a registered backend account to sign in. The frontend stores access and refresh tokens in `sessionStorage`, calls `/api/v1/users/me` after login, and attempts the documented refresh endpoint once after a 401 response.

**Explore demo workspace** opens an isolated sample dataset and disables live API writes. Demo document upload is simulated. The HSN sample suggestions are explicitly illustrative. Demo export downloads a CSV preview; live API mode downloads the backend-generated `.xlsx` response.

## API coverage

The frontend adapter uses endpoints from the supplied Postman collection:

| Capability | API route(s) |
|---|---|
| Health | `GET /health` |
| Signup / OTP / login / refresh / logout | `/api/v1/auth/signup`, `/verify-otp`, `/login`, `/refresh`, `/logout` |
| Current user and RBAC | `GET /api/v1/users/me`, `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/{userId}` |
| Shipment registry | `GET/POST /api/v1/shipments`, `GET/DELETE /api/v1/shipments/{shipmentId}` |
| Document ingestion | `POST /api/v1/shipments/{shipmentId}/documents`, `GET .../documents`, `GET /api/v1/documents/{documentId}/file` |
| Review and verification | `GET /api/v1/shipments/{shipmentId}/review`, `PATCH /api/v1/shipments/{shipmentId}/fields/{fieldId}` |
| Manager override | `POST /api/v1/shipments/{shipmentId}/cross-checks/{checkId}/override` |
| Customs export | `GET /api/v1/shipments/{shipmentId}/export` |
| Accuracy and audit | `GET /api/v1/analytics/accuracy`, `GET /api/v1/analytics/audit-logs` |

The collection includes request examples and route descriptions but no saved response examples or formal response schemas. Several response shapes are normalized in `src/lib/utils.js`; confirm the exact payloads from the running FastAPI service before deployment.

## Export gatekeeper

`src/lib/gatekeeper.js` contains the testable client-side export preflight. It blocks when a required source document is missing, an extracted field below 85% confidence remains unverified, or a returned cross-check is unresolved. A manager override clears a failed check only when the API returns / the client records an overridden state.

**Important boundary:** cross-document arithmetic and weight / package reconciliation are not fabricated in the browser. Those results must come from the extraction/review backend payload. The backend export endpoint remains authoritative and may return HTTP 422 if its validation state differs from the UI snapshot.

## Integration gaps in the supplied API contract

- No OTP resend endpoint is documented. The UI exposes the countdown and communicates the API limitation when resend is attempted.
- No `replace_existing` upload field is documented. The switch records operator intent only; the upload request sends the specified `doc_type` and `file` fields.
- No notification stream is documented. The notification panel is a UI preview, not live push notifications.
- No batch field-verification route is documented. **Verify all fields** submits one documented PATCH request per field.
- HSN classification, duty calculation, importer tracking, and external customs-portal filing are outside this focused build and are not exposed in the primary navigation.

## Security and privacy notes

- Do not commit `.env` files, access tokens, real importer contacts, or actual confidential shipment data.
- `.env` and `.env.local` are ignored by Git; only `.env.example` is committed, with variable names and a local default URL.
- Access and refresh tokens are kept in `sessionStorage`, not persistent local storage.
- Production must use HTTPS, a production FastAPI CORS allowlist, server-side RBAC on every protected route, rate limiting for authentication, and a regional AI service contract that prohibits training on customer data.
- The browser-side gatekeeper is a usability layer, not an authorization boundary. Enforce export policy again on the backend.

## Project structure

```text
src/
  App.jsx                 Auth, app shell, shipment list, upload and review screens
  index.css               Tailwind base and existing component layout styles
  theme.css               Light / dark design tokens and responsive visual layer
  main.jsx                React entry point
  components/ui.jsx       Radix-backed Shadcn-style primitives and theme-aware controls
  lib/api.js              FastAPI client, token refresh and upload progress
  lib/gatekeeper.js       Export preflight rules
  lib/utils.js            API response normalization and formatting helpers
tests/
  gatekeeper.test.js      Gatekeeper behavior tests
```
