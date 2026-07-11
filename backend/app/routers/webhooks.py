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
        # Return non-2xx so Nomba's retry/backoff policy kicks in — it only retries
        # on a non-2xx response. A 200 here (the old behaviour) told Nomba the event
        # was handled even when a transient DB blip meant nothing was saved, so it
        # never retried and the payment silently dropped until reconciliation.
        # Idempotency on source_transfer_id makes the retry safe from double-counting.
        logger.error("Webhook processing failed, asking Nomba to retry: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="processing failed, please retry")

    return {"status": "ok"}
