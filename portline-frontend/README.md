# Portline frontend (React + Vite)

    npm install
    cp .env.example .env     # set VITE_API_URL (default http://localhost:8000)
    npm run dev              # http://localhost:5173

The backend URL can also be changed on the login screen under "API connection settings".
The FastAPI backend must allow this origin via CORS.

- `src/api.js`: every endpoint from the Postman collection (method, path, body, auth, refresh-on-401)
- `src/normalize.js`: maps the review/analytics payloads (matches the backend routers you shared)

## Backend CORS (required for PATCH, DELETE, export filename)

    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])
