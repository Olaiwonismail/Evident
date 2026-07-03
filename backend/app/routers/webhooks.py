import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import get_db
from app.services.webhook import process_payment_success, verify_nomba_signature

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/nomba")
async def nomba_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    payload = await request.json()

    # active only when NOMBA_SIGNATURE_KEY is set in .env
    if settings.nomba_signature_key:
        signature = request.headers.get("nomba-signature", "")
        timestamp = request.headers.get("nomba-timestamp", "")
        if not verify_nomba_signature(payload, timestamp, signature):
            logger.warning("Webhook rejected: invalid signature")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event_type = payload.get("event_type")
    if event_type != "payment_success":
        # acknowledge unknown events without processing
        return {"status": "ignored", "event_type": event_type}

    try:
        await process_payment_success(payload, db)
    except Exception as exc:
        logger.error("Webhook processing error: %s", exc, exc_info=True)
        # still return 200 so Nomba doesn't retry indefinitely — log for manual review
        return {"status": "error", "detail": str(exc)}

    return {"status": "ok"}
