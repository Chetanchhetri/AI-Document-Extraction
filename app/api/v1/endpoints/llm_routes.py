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


class CompareRequest(BaseModel):
    shipments: List[Dict[str, Any]]
    analysis_type: Optional[str] = "general"


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


@router.post("/copilot/compare", tags=["ai"])
async def compare_shipments(req: CompareRequest):
    """Comparative analysis engine for multi-shipment and supplier evaluation using Gemma 2 (2B)."""
    if len(req.shipments) < 2:
        raise HTTPException(status_code=400, detail="At least 2 shipments are required for comparative analysis.")

    summary_list = []
    for index, item in enumerate(req.shipments, start=1):
        s_info = item.get("shipment", {})
        fields = item.get("fields", [])
        checks = item.get("checks", [])
        failed_count = len([c for c in checks if c.get("failed")])
        summary_list.append(
            f"Shipment {index} ({s_info.get('shipment_code', 'Unknown')}):\n"
            f"- Supplier/Company: {s_info.get('supplier_name', 'N/A')}\n"
            f"- Status: {s_info.get('status', 'N/A')}\n"
            f"- Extracted Fields Count: {len(fields)}\n"
            f"- Discrepancies Count: {failed_count}\n"
            f"- Key Fields: {[{f.get('name'): f.get('value')} for f in fields[:6]]}"
        )

    joined_summary = "\n\n".join(summary_list)

    system_prompt = (
        "You are a senior customs compliance and supply-chain auditor. Compare the given shipments/suppliers. "
        "Highlight variance in valuation, total weights, country origins, discrepancy risk, and supply chain consistency. "
        "Organize output into 3 bulleted sections: **Key Variances**, **Compliance & Discrepancy Risk**, and **Executive Recommendation**."
    )

    user_prompt = f"Comparative Payload Data:\n\n{joined_summary}"

    try:
        report = generate_gemma_response(system_prompt, user_prompt, max_tokens=400)
        return {
            "compared_count": len(req.shipments),
            "report": report,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemma 2 comparative analysis error: {str(e)}")