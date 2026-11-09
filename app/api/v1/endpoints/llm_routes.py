from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.llm_service import generate_gemma_response

router = APIRouter()


class CopilotRequest(BaseModel):
    query: str
    shipment_code: Optional[str] = None
    supplier_name: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class HsnRequest(BaseModel):
    item_description: str
    candidates: Optional[List[Dict[str, Any]]] = None


@router.post("/copilot/chat", tags=["ai"])
async def copilot_chat(req: CopilotRequest):
    """Context-aware AI Copilot Q&A endpoint using Gemma 2 (2B)."""
    fields = req.context.get("fields", []) if req.context else []
    lines = req.context.get("lines", []) if req.context else []
    checks = req.context.get("checks", []) if req.context else []

    system_prompt = (
        "You are Portline AI Assistant. Answer the user's question accurately and concisely using ONLY the provided shipment context. "
        "Keep your response direct and format key metric names, codes, values, and answers in **bold** text."
    )

    context_str = (
        f"Shipment Code: {req.shipment_code or 'N/A'}\n"
        f"Supplier: {req.supplier_name or 'N/A'}\n"
        f"Extracted Fields: {fields}\n"
        f"Line Items: {lines}\n"
        f"Cross Checks: {checks}"
    )

    user_prompt = f"Shipment Context:\n{context_str}\n\nQuestion: {req.query}"

    try:
        reply = generate_gemma_response(system_prompt, user_prompt, max_tokens=256)
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemma 2 inference error: {str(e)}")


@router.post("/hsn/suggest", tags=["ai"])
async def hsn_suggest(req: HsnRequest):
    """Customs HSN code suggestion engine powered by Gemma 2 (2B)."""
    system_prompt = (
        "You are a customs tariff classification expert. Analyze the item description "
        "and select or explain the most accurate HSN code candidate. Format the code and key terms in **bold**."
    )

    user_prompt = (
        f"Item Description: {req.item_description}\n"
        f"Candidate HSN Codes: {req.candidates or 'None provided'}"
    )

    try:
        explanation = generate_gemma_response(system_prompt, user_prompt, max_tokens=200)
        return {
            "item_description": req.item_description,
            "match_explanation": explanation,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemma 2 inference error: {str(e)}")