import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database import init_db
from app.services import nomba_client
from app.routers import collectives, ledger, expenses, webhooks, banks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def _tx_to_webhook_payload(tx: dict) -> dict:
    """Rebuild the payment_success shape from a Nomba account-feed row so a missed
    payment can be replayed through the exact same webhook logic."""
    tx_id = tx.get("id") or tx.get("transactionId")
    return {
        "event_type": "payment_success",
        "requestId": f"recon-{tx_id}",
        "data": {
            "merchant": {"userId": tx.get("userId", ""), "walletId": ""},
            "transaction": {
                "transactionId": tx_id,
                "type": tx.get("type", "vact_transfer"),
                "transactionAmount": tx.get("amount") or tx.get("transactionAmount") or 0,
                "time": tx.get("timeCreated") or tx.get("time") or "",
                "responseCode": "",
                # recipient account + accountRef let the handler match member OR collective
                "aliasAccountNumber": str(tx.get("recipientAccountNumber") or ""),
                "accountRef": tx.get("virtualAccountReference") or "",
            },
            "customer": {
                "senderName": tx.get("ktaSenderName") or tx.get("senderName") or "",
                "accountNumber": tx.get("ktaSenderAccountNumber") or "",
            },
        },
    }


async def _reconciliation_sweep():
    """Every 15 min: self-heal payments the webhook missed. Scans Nomba's account
    feed for credits into ANY Evident account (member or collective) that we
    haven't recorded, and replays each through the normal webhook logic so it
    lands on the ledger / review queue automatically — no manual replay needed."""
    from app.database import AsyncSessionLocal
    from sqlalchemy import select
    from app.models.collective import Collective
    from app.models.member import Member
    from app.models.contribution import Contribution
    from app.models.unmatched import UnmatchedTransfer
    from app.services.webhook import process_payment_success

    now = datetime.utcnow()
    start_s = (now - timedelta(days=1)).strftime("%Y-%m-%d")  # yesterday+today covers midnight
    end_s = now.strftime("%Y-%m-%d")

    async with AsyncSessionLocal() as db:
        members = (await db.execute(select(Member))).scalars().all()
        colls = (await db.execute(select(Collective))).scalars().all()
        member_ids = {m.id for m in members}
        coll_ids = {c.id for c in colls}
        evident_accts = {m.bank_account_number for m in members if m.bank_account_number} | {
            c.bank_account_number for c in colls if c.bank_account_number
        }
        # already recorded — both credited contributions and queued unmatched transfers
        seen = {r for (r,) in (await db.execute(select(Contribution.source_transfer_id))).all()}
        seen |= {r for (r,) in (await db.execute(select(UnmatchedTransfer.source_transfer_id))).all()}

        # page through the shared account feed (it 404s on the per-NUBAN endpoint)
        txns, cursor = [], None
        try:
            for _ in range(10):  # cap pages so a busy shared wallet can't run away
                data = await nomba_client.fetch_account_transactions(start_s, end_s, cursor=cursor, limit=100)
                batch = data.get("results") or data.get("transactions") or []
                txns += batch
                cursor = data.get("cursor") or data.get("nextCursor")
                if not cursor or not batch:
                    break
        except Exception as exc:
            logger.error("Reconciliation sweep: feed fetch failed: %s", exc)
            return

        healed = 0
        for tx in txns:
            if tx.get("entryType") and tx.get("entryType") != "CREDIT":
                continue  # only money coming IN
            tx_id = tx.get("id") or tx.get("transactionId")
            if not tx_id or tx_id in seen:
                continue
            ref = tx.get("virtualAccountReference") or ""
            recipient = str(tx.get("recipientAccountNumber") or "")
            is_evident = (
                (ref.startswith("mbr_") and ref[4:] in member_ids)
                or ref in coll_ids
                or recipient in evident_accts
            )
            if not is_evident:
                continue  # some other team's account on the shared wallet
            try:
                await process_payment_success(_tx_to_webhook_payload(tx), db)
                seen.add(tx_id)  # guard against the same tx appearing twice in one sweep
                healed += 1
                logger.info("Reconciliation: healed missed payment %s", tx_id)
            except Exception as exc:
                logger.error("Reconciliation: failed to heal %s: %s", tx_id, exc)
        if healed:
            logger.info("Reconciliation sweep healed %d missed payment(s)", healed)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        await nomba_client.get_token()  # issue token at startup
    except Exception as exc:
        logger.error("Nomba token issue failed at startup (will retry on first API call): %s", exc)
    scheduler.add_job(_reconciliation_sweep, "interval", minutes=15)
    scheduler.start()
    logger.info("Evident backend started")
    yield
    scheduler.shutdown()


app = FastAPI(title="Evident API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(collectives.router)
app.include_router(ledger.router)
app.include_router(expenses.router)
app.include_router(webhooks.router)
app.include_router(banks.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
