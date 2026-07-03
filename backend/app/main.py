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


async def _reconciliation_sweep():
    """Every 15 min: compare Nomba transactions against local ledger to catch missed webhooks."""
    from app.database import AsyncSessionLocal
    from sqlalchemy import select
    from app.models.collective import Collective
    from app.models.contribution import Contribution

    end = datetime.utcnow()
    start = end - timedelta(minutes=20)  # slight overlap to avoid gaps

    async with AsyncSessionLocal() as db:
        collectives_result = await db.execute(
            select(Collective).where(Collective.bank_account_number != None)
        )
        collectives = collectives_result.scalars().all()

        for collective in collectives:
            try:
                transactions = await nomba_client.fetch_virtual_account_transactions(
                    collective.bank_account_number,
                    start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                )
                for tx in transactions:
                    tx_id = tx.get("transactionId") or tx.get("id")
                    existing = await db.execute(
                        select(Contribution).where(Contribution.source_transfer_id == tx_id)
                    )
                    if not existing.scalar_one_or_none():
                        logger.warning(
                            "Reconciliation: unrecorded transaction %s on collective %s",
                            tx_id, collective.id,
                        )
                        # queue for review — a proper implementation would reprocess the payment
            except Exception as exc:
                logger.error("Reconciliation sweep failed for collective %s: %s", collective.id, exc)


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
