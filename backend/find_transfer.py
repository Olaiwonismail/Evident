"""Throwaway diagnostic for a CONTRIBUTION (money paid INTO the collective).

Usage:
  python find_transfer.py               # what the APP recorded: collectives, contributions, unmatched queue
  python find_transfer.py nomba <acct>  # what NOMBA actually received on that virtual account (LIVE, ground truth)
  python find_transfer.py nomba <acct> <days>   # look back N days (default 14)

Reads DATABASE_URL / Nomba creds from backend/.env, same as the app.
The point: if Nomba shows a credit the app has no contribution/unmatched row for,
the money is safe in your virtual account — the webhook just never recorded it.
"""
import asyncio
import sys
from datetime import datetime, timedelta

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.collective import Collective
from app.models.contribution import Contribution
from app.models.unmatched import UnmatchedTransfer
from app.services import nomba_client


async def show_app_records() -> None:
    async with AsyncSessionLocal() as db:
        cols = (await db.execute(select(Collective))).scalars().all()
        contribs = (
            await db.execute(select(Contribution).order_by(Contribution.timestamp.desc()).limit(25))
        ).scalars().all()
        unmatched = (
            await db.execute(
                select(UnmatchedTransfer)
                .where(UnmatchedTransfer.status == "needs_review")
                .order_by(UnmatchedTransfer.timestamp.desc())
            )
        ).scalars().all()

    print(f"Nomba base URL: {settings.nomba_base_url}\n")

    print("=== COLLECTIVES (virtual accounts money is paid into) ===")
    for c in cols:
        print(f"  {c.name}")
        print(f"    collective_id: {c.id}")
        print(f"    pay-in account: {c.bank_account_number}  (VA id {c.virtual_account_id})")
    if not cols:
        print("  (none)")

    print("\n=== CONTRIBUTIONS the app recorded (most recent 25) ===")
    if not contribs:
        print("  (none)")
    for x in contribs:
        who = x.sender_name or x.member_id or "?"
        print(f"  {x.timestamp:%Y-%m-%d %H:%M}  NGN {float(x.amount):>10,.2f}  {x.status:<9} from {who}  (tx {x.source_transfer_id})")

    print("\n=== UNMATCHED — money received but not tied to a member (needs review) ===")
    if not unmatched:
        print("  (none)")
    for u in unmatched:
        print(f"  {u.timestamp:%Y-%m-%d %H:%M}  NGN {float(u.amount):>10,.2f}  from {u.sender_name} / {u.sender_account}  (tx {u.source_transfer_id})")

    print("\nTo see what Nomba ACTUALLY received on an account:")
    print("  python find_transfer.py nomba <pay-in-account-number>")


async def show_nomba_truth(account_number: str, days: int = 14) -> None:
    end = datetime.utcnow()
    start = end - timedelta(days=days)
    start_s, end_s = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")

    print(f"Nomba base URL: {settings.nomba_base_url}")
    print(f"Virtual account {account_number}, {start_s} -> {end_s} (LIVE)\n")

    txns = await nomba_client.fetch_virtual_account_transactions(account_number, start_s, end_s)
    if not txns:
        print("Nomba reports NO transactions on this account in that window.")
        print("If you expected money here: check you sent to the right account number,")
        print("or widen the window:  python find_transfer.py nomba <acct> 30")
        return

    # cross-reference against what the app recorded
    async with AsyncSessionLocal() as db:
        known = {
            r for (r,) in (await db.execute(select(Contribution.source_transfer_id))).all()
        } | {
            r for (r,) in (await db.execute(select(UnmatchedTransfer.source_transfer_id))).all()
        }

    print(f"Nomba shows {len(txns)} transaction(s):\n")
    for t in txns:
        tx_id = t.get("transactionId") or t.get("id") or ""
        amount = t.get("transactionAmount") or t.get("amount") or "?"
        ttype = t.get("type", "")
        time = t.get("time") or t.get("dateCreated") or ""
        sender = t.get("senderName") or t.get("narration", "")
        recorded = "recorded in app" if tx_id in known else ">>> NOT in app (money is here, app never logged it)"
        print(f"  {time}  {ttype:<14} NGN {amount:>10}  {sender}")
        print(f"      tx {tx_id}  [{recorded}]")


async def show_account_feed(days: int = 30) -> None:
    """Every transaction on the Nomba wallet (all virtual accounts), the real
    ground truth. Prints credits and flags any not recorded by the app."""
    end = datetime.now()
    start = end - timedelta(days=days)
    start_s, end_s = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")

    print(f"Nomba base URL: {settings.nomba_base_url}")
    print(f"Account-wide feed {start_s} -> {end_s} (LIVE)\n")

    data = await nomba_client.fetch_account_transactions(start_s, end_s, limit=100)
    txns = data.get("results") or data.get("transactions") or data.get("data") or []
    if not txns:
        print("Nomba reports NO transactions on the account in that window.")
        print("Raw response keys:", list(data.keys()))
        return

    async with AsyncSessionLocal() as db:
        known = {
            r for (r,) in (await db.execute(select(Contribution.source_transfer_id))).all()
        } | {
            r for (r,) in (await db.execute(select(UnmatchedTransfer.source_transfer_id))).all()
        }

    print(f"Nomba shows {len(txns)} transaction(s):\n")
    for t in txns:
        tx_id = t.get("transactionId") or t.get("id") or ""
        amount = t.get("transactionAmount") or t.get("amount") or "?"
        ttype = t.get("type", "")
        time = t.get("time") or t.get("dateCreated") or ""
        who = t.get("senderName") or t.get("narration", "")
        acct = t.get("aliasAccountNumber") or t.get("accountNumber") or ""
        recorded = "recorded" if tx_id in known else ">>> NOT in app"
        print(f"  {time}  {ttype:<16} NGN {str(amount):>10}  -> {acct}  {who}")
        print(f"      tx {tx_id}  [{recorded}]")


async def who_owns(account: str) -> None:
    """Find which collective or member (in the prod DB) owns a virtual account,
    then ask Nomba what the account actually is."""
    from app.models.member import Member

    async with AsyncSessionLocal() as db:
        cols = (
            await db.execute(
                select(Collective).where(
                    (Collective.bank_account_number == account)
                    | (Collective.virtual_account_id == account)
                )
            )
        ).scalars().all()
        mems = (
            await db.execute(
                select(Member).where(
                    (Member.bank_account_number == account)
                    | (Member.virtual_account_id == account)
                )
            )
        ).scalars().all()

    print(f"Account {account}")
    print("  matching COLLECTIVES in prod DB:", [(c.name, c.id) for c in cols] or "NONE")
    print("  matching MEMBERS in prod DB:   ", [(m.name, m.id, m.collective_id) for m in mems] or "NONE")

    print("\n  Asking Nomba what this account is (LIVE) ...")
    for ref in (account, f"mbr_{account}"):
        try:
            info = await nomba_client.fetch_virtual_account(ref)
            print(f"  Nomba fetch_virtual_account('{ref}') ->")
            for k, v in info.items():
                print(f"      {k}: {v}")
            break
        except Exception as exc:
            print(f"  fetch_virtual_account('{ref}') failed: {exc}")


async def main() -> None:
    args = sys.argv[1:]
    if args and args[0] == "who" and len(args) >= 2:
        await who_owns(args[1].strip())
    elif args and args[0] == "nomba" and len(args) >= 2:
        days = int(args[2]) if len(args) >= 3 else 14
        await show_nomba_truth(args[1].strip(), days)
    elif args and args[0] == "feed":
        days = int(args[1]) if len(args) >= 2 else 30
        await show_account_feed(days)
    else:
        await show_app_records()


if __name__ == "__main__":
    asyncio.run(main())
