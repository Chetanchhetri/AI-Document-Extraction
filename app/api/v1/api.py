from fastapi import APIRouter
from app.api.v1.endpoints import documents

from app.api.v1.endpoints import analytics, auth, documents, export, hsn, review, shipments, users

api_router = APIRouter()
api_router.include_router(documents.router)
api_router.include_router(documents.direct_router)

for module in (auth, users, shipments, documents, review, export, hsn, analytics):
    api_router.include_router(module.router)
