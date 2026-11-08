from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_executive
from app.core.config import settings
from app.core.database import get_session
from app.models import Shipment, ShipmentLineItem, ShipmentStatus, User
from app.schemas.shipment import HSNSuggestRequest, HSNSuggestion
from app.services.embeddings import cosine, embed_one, model_id

router = APIRouter(prefix="/hsn", tags=["hsn"])


@router.post("/suggest", response_model=list[HSNSuggestion])
async def suggest_hsn(body: HSNSuggestRequest, _user: User = Depends(require_executive),
                      session: AsyncSession = Depends(get_session)):
    """Semantic HSN suggestions from line items of approved/exported shipments."""
    search_text = body.effective_description
    if not search_text or len(search_text.strip()) < 2:
        raise HTTPException(status_code=422, detail="Valid product description required for HSN lookup")

    query = await embed_one(search_text)
    rows = (await session.exec(
        select(ShipmentLineItem, Shipment.shipment_code)
        .join(Shipment, Shipment.id == ShipmentLineItem.shipment_id)
        .where(ShipmentLineItem.hsn_code.is_not(None),
               Shipment.status.in_([ShipmentStatus.approved, ShipmentStatus.exported])))).all()
    min_score = body.min_score if body.min_score is not None else settings.HSN_MIN_SCORE
    best: dict[str, dict] = {}
    for item, code in rows:
        emb = item.embedding or {}
        if emb.get("model") != model_id():
            continue
        score = cosine(query["vector"], emb["vector"])
        if score < min_score:
            continue
        entry = best.setdefault(item.hsn_code, {"score": 0.0, "desc": "", "code": "", "n": 0})
        entry["n"] += 1
        if score > entry["score"]:
            entry.update(score=score, desc=item.item_description, code=code)
    ranked = sorted(best.items(), key=lambda kv: kv[1]["score"], reverse=True)[: body.top_k]
    return [HSNSuggestion(hsn_code=h, score=round(v["score"], 4), matched_description=v["desc"],
                          shipment_code=v["code"], occurrences=v["n"]) for h, v in ranked]