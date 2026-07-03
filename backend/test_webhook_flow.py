"""One-shot local verification of the webhook contribution pipeline.

Seeds a collective + member into a scratch SQLite db, then fires simulated
Nomba payment_success events at the ASGI app (no network, no real money).
Run:  python test_webhook_flow.py
"""
import asyncio
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")  # Windows console defaults to cp1252, which can't print ₦
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_webhook.db"

import httpx

from app.database import AsyncSessionLocal, init_db
from app.main import app
from app.models.collective import Collective
from app.models.member import Member


def payment_payload(tx_id: str, amount_naira: float, sender_account: str, sender_name: str) -> dict:
    # mirrors the payment_success sample on developer.nomba.com (amounts in naira)
    return {
        "event_type": "payment_success",
        "requestId": f"req-{tx_id}",
        "data": {
            "merchant": {"userId": "user-1", "walletId": "wallet-unknown", "walletBalance": 0},
            "transaction": {
                "transactionId": tx_id,
                "type": "vact_transfer",
                "transactionAmount": amount_naira,
                "fee": 5,
                "time": "2026-07-03T01:00:00Z",
                "responseCode": "",
                "aliasAccountNumber": "7985665613",  # matches by NUBAN, not walletId
            },
            "customer": {
                "senderName": sender_name,
                "bankCode": "090645",
                "bankName": "Nombank",
                "accountNumber": sender_account,
            },
        },
    }


def check_signature_roundtrip() -> None:
    """Compute a signature the way Nomba documents it and confirm we verify it."""
    import base64
    import hashlib
    import hmac

    from app.config import settings
    from app.services.webhook import verify_nomba_signature

    settings.nomba_signature_key = "test-signature-key"
    payload = payment_payload("TX-SIG", 1000, "0812345678", "Dayo Asumo")
    t, m = payload["data"]["transaction"], payload["data"]["merchant"]
    timestamp = "2026-07-03T01:00:00Z"
    message = ":".join([
        payload["event_type"], payload["requestId"], m["userId"], m["walletId"],
        t["transactionId"], t["type"], t["time"], t["responseCode"], timestamp,
    ])
    sig = base64.b64encode(
        hmac.new(b"test-signature-key", message.encode(), hashlib.sha256).digest()
    ).decode()
    assert verify_nomba_signature(payload, timestamp, sig), "valid signature rejected"
    assert not verify_nomba_signature(payload, timestamp, "bogus"), "bogus signature accepted"
    settings.nomba_signature_key = ""
    print("signature roundtrip: OK")


async def main() -> None:
    check_signature_roundtrip()
    await init_db()
    async with AsyncSessionLocal() as db:
        db.add(Collective(
            id="col-1", name="Local Test Collective", purpose="webhook test",
            dues_amount=1000, dues_frequency="monthly",
            bank_account_number="7985665613", bank_name="Nombank MFB",
            created_by="mem-1",
        ))
        db.add(Member(
            id="mem-1", collective_id="col-1", name="Dayo Asumo",
            phone="0812345678", role="member",
        ))
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. exact payment from a known member
        r = await client.post("/webhooks/nomba", json=payment_payload("TX-001", 1000, "0812345678", "Dayo Asumo"))
        print("exact payment:", r.status_code, r.json())

        # 2. duplicate delivery of the same event (idempotency)
        r = await client.post("/webhooks/nomba", json=payment_payload("TX-001", 1000, "0812345678", "Dayo Asumo"))
        print("duplicate:", r.status_code, r.json())

        # 3. partial payment from the same member
        r = await client.post("/webhooks/nomba", json=payment_payload("TX-002", 400, "0812345678", "Dayo Asumo"))
        print("partial payment:", r.status_code, r.json())

        # 4. payment from an unknown sender -> unmatched queue, no ledger entry
        r = await client.post("/webhooks/nomba", json=payment_payload("TX-003", 1000, "0999999999", "Unknown Person"))
        print("unknown sender:", r.status_code, r.json())

        ledger = (await client.get("/collectives/col-1/ledger")).json()
        print("\nfinal balance:", ledger["balance"], "(expected 1400.0)")
        for e in ledger["entries"]:
            print("  entry:", e["type"], e["amount"], "->", e["balance_after"], "|", e["description"])

        contribs = (await client.get("/collectives/col-1/members/mem-1/contributions")).json()
        print("member total paid:", contribs["total_paid"], "statuses:", [c["status"] for c in contribs["contributions"]])


if __name__ == "__main__":
    asyncio.run(main())
