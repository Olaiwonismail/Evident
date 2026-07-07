import base64
import hashlib
import hmac
import logging
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.config import settings
from app.models.collective import Collective
from app.models.member import Member
from app.models.contribution import Contribution
from app.models.ledger import LedgerEntry
from app.models.unmatched import UnmatchedTransfer

logger = logging.getLogger(__name__)


def verify_nomba_signature(payload: dict, timestamp: str, received_sig: str) -> bool:
    """Per developer.nomba.com: HMAC-SHA256 over colon-joined fields, base64-encoded,
    sent in the nomba-signature header (timestamp from nomba-timestamp)."""
    t = payload.get("data", {}).get("transaction", {})
    m = payload.get("data", {}).get("merchant", {})
    response_code = t.get("responseCode", "")
    if response_code in (None, "null"):
        response_code = ""
    message = ":".join([
        payload.get("event_type", ""),
        payload.get("requestId", ""),
        m.get("userId", ""),
        m.get("walletId", ""),
        t.get("transactionId", ""),
        t.get("type", ""),
        t.get("time", ""),
        response_code,
        timestamp,
    ])
    digest = hmac.new(
        settings.nomba_signature_key.encode(),
        message.encode(),
        hashlib.sha256,
    ).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, received_sig)


async def _current_balance(collective_id: str, db: AsyncSession) -> Decimal:
    result = await db.execute(
        select(LedgerEntry)
        .where(LedgerEntry.collective_id == collective_id)
        .order_by(LedgerEntry.timestamp.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    return Decimal(str(last.balance_after)) if last else Decimal("0")


async def _match_member(collective_id: str, sender_name: str, sender_account: str, db: AsyncSession):
    """Try to match by phone/email stored on member. Extend later with reference codes."""
    result = await db.execute(
        select(Member).where(
            Member.collective_id == collective_id,
            Member.phone == sender_account,
        )
    )
    return result.scalar_one_or_none()


async def _match_member_by_receiving_account(payload: dict, db: AsyncSession):
    """The strong signal: which account RECEIVED the money. With per-member
    pay-in accounts, a transfer into a member's own account is unambiguously
    theirs — no sender guesswork, never unmatched."""
    data = payload.get("data", {})
    transaction = data.get("transaction", {})
    order = data.get("order", {})
    candidates = {
        transaction.get("aliasAccountNumber"),
        transaction.get("aliasAccountReference"),
        transaction.get("accountNumber"),
        transaction.get("bankAccountNumber"),
        transaction.get("accountRef"),
        order.get("accountRef"),
    }
    candidates = {c for c in candidates if c}
    if not candidates:
        return None
    # accountRef for member accounts is "mbr_<member_id>"
    ref_ids = {c[4:] for c in candidates if isinstance(c, str) and c.startswith("mbr_")}
    conditions = [
        Member.virtual_account_id.in_(candidates),
        Member.bank_account_number.in_(candidates),
    ]
    if ref_ids:
        conditions.append(Member.id.in_(ref_ids))
    result = await db.execute(select(Member).where(or_(*conditions)))
    return result.scalars().first()


async def _find_collective(payload: dict, db: AsyncSession):
    """Nomba's create-VA response exposes no walletId, only accountRef and
    bankAccountNumber — so match the webhook against every identifier it may carry."""
    data = payload.get("data", {})
    transaction = data.get("transaction", {})
    merchant = data.get("merchant", {})
    order = data.get("order", {})
    candidates = {
        merchant.get("walletId"),
        transaction.get("aliasAccountNumber"),
        transaction.get("aliasAccountReference"),
        transaction.get("accountNumber"),
        transaction.get("bankAccountNumber"),
        transaction.get("accountRef"),
        order.get("accountRef"),
    }
    candidates = {c for c in candidates if c}
    if not candidates:
        return None
    result = await db.execute(
        select(Collective).where(
            or_(
                Collective.virtual_account_id.in_(candidates),
                Collective.bank_account_number.in_(candidates),
                Collective.id.in_(candidates),
            )
        )
    )
    return result.scalars().first()


async def process_payment_success(payload: dict, db: AsyncSession) -> None:
    transaction = payload.get("data", {}).get("transaction", {})
    customer = payload.get("data", {}).get("customer", {})

    source_transfer_id = transaction.get("transactionId")
    # per developer.nomba.com, transactionAmount is in naira
    amount_naira = Decimal(str(transaction.get("transactionAmount") or transaction.get("amount") or 0))
    sender_name = customer.get("senderName") or transaction.get("senderName") or transaction.get("narration", "")
    sender_account = customer.get("accountNumber") or transaction.get("senderAccountNumber", "")

    # idempotency — skip if already processed
    existing = await db.execute(
        select(Contribution).where(Contribution.source_transfer_id == source_transfer_id)
    )
    if existing.scalar_one_or_none():
        logger.info("Duplicate webhook for %s — skipping", source_transfer_id)
        return

    # strongest signal first: money into a member's OWN pay-in account is theirs.
    member = await _match_member_by_receiving_account(payload, db)
    if member:
        collective_result = await db.execute(
            select(Collective).where(Collective.id == member.collective_id)
        )
        collective = collective_result.scalar_one_or_none()
    else:
        collective = await _find_collective(payload, db)

    if not collective:
        logger.warning(
            "No collective matched webhook %s (walletId=%s)",
            source_transfer_id,
            payload.get("data", {}).get("merchant", {}).get("walletId"),
        )
        return

    # fall back to sender phone-matching only if the receiving account didn't pin a member
    if member is None:
        member = await _match_member(collective.id, sender_name, sender_account, db)
    expected = Decimal(str(collective.dues_amount)) if collective.dues_amount else None

    # reconciliation logic
    if member is None:
        status = "unmatched"
    elif expected is None:
        status = "exact"
    elif amount_naira < expected:
        status = "partial"
    elif amount_naira > expected:
        status = "excess"
    else:
        status = "exact"

    if status == "unmatched":
        unmatched = UnmatchedTransfer(
            collective_id=collective.id,
            source_transfer_id=source_transfer_id,
            amount=amount_naira,
            sender_name=sender_name,
            sender_account=sender_account,
        )
        db.add(unmatched)
        await db.commit()
        logger.info("Unmatched transfer %s queued for review", source_transfer_id)
        return

    contribution = Contribution(
        collective_id=collective.id,
        member_id=member.id if member else None,
        amount=amount_naira,
        expected_amount=expected,
        status=status,
        source_transfer_id=source_transfer_id,
        sender_name=sender_name,
        sender_account=sender_account,
    )
    db.add(contribution)
    await db.flush()

    current_balance = await _current_balance(collective.id, db)
    new_balance = current_balance + amount_naira

    description = f"{sender_name} paid ₦{amount_naira:,.2f}"
    if status == "partial":
        shortfall = expected - amount_naira
        description += f" (partial — ₦{shortfall:,.2f} still owed)"
    elif status == "excess":
        overage = amount_naira - expected
        description += f" (₦{overage:,.2f} credited to next period)"

    ledger_entry = LedgerEntry(
        collective_id=collective.id,
        type="contribution",
        ref_id=contribution.id,
        amount=amount_naira,
        balance_after=new_balance,
        description=description,
        actor_name=member.name if member else sender_name,
    )
    db.add(ledger_entry)
    await db.commit()
    logger.info("Contribution logged: %s ₦%s status=%s", source_transfer_id, amount_naira, status)
