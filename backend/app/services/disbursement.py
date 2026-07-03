import asyncio
import logging
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.expense import Expense
from app.models.ledger import LedgerEntry
from app.models.member import Member
from app.models.collective import Collective
from app.services import nomba_client

logger = logging.getLogger(__name__)

MAX_REQUERY_ATTEMPTS = 10
REQUERY_INTERVAL_SECONDS = 30


async def _current_balance(collective_id: str, db: AsyncSession) -> Decimal:
    result = await db.execute(
        select(LedgerEntry)
        .where(LedgerEntry.collective_id == collective_id)
        .order_by(LedgerEntry.timestamp.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    return Decimal(str(last.balance_after)) if last else Decimal("0")


async def _reverse_expense_debit(expense: Expense, db: AsyncSession, entry_type: str = "expense_failed") -> None:
    """Append a credit entry cancelling the debit written before the transfer attempt.

    The ledger is append-only, so a failed disbursement is corrected by a new
    reversing entry rather than deleting the original debit.
    """
    current_balance = await _current_balance(expense.collective_id, db)
    amount = Decimal(str(expense.amount))
    db.add(LedgerEntry(
        collective_id=expense.collective_id,
        type=entry_type,
        ref_id=expense.id,
        amount=amount,
        balance_after=current_balance + amount,
        description=f"Reversal — transfer for '{expense.reason[:60]}' did not complete",
        actor_name="system",
    ))


async def disburse_expense(expense_id: str, approver_id: str, db: AsyncSession) -> Expense:
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense or expense.status != "pending":
        raise ValueError("Expense not found or not in pending state")

    approver_result = await db.execute(select(Member).where(Member.id == approver_id))
    approver = approver_result.scalar_one_or_none()
    if not approver or approver.role not in ("committee", "organizer"):
        raise PermissionError("Only committee members can approve expenses")

    collective_result = await db.execute(select(Collective).where(Collective.id == expense.collective_id))
    collective = collective_result.scalar_one_or_none()

    current_balance = await _current_balance(expense.collective_id, db)
    if Decimal(str(expense.amount)) > current_balance:
        raise ValueError("Insufficient collective balance")

    expense.status = "disbursing"
    expense.approved_by = approver_id
    await db.flush()

    narration = f"{collective.name} — {expense.reason[:50]}"

    # write ledger entry BEFORE the transfer call so intent is always recorded
    new_balance = current_balance - Decimal(str(expense.amount))
    ledger_entry = LedgerEntry(
        collective_id=expense.collective_id,
        type="expense",
        ref_id=expense.id,
        amount=-Decimal(str(expense.amount)),
        balance_after=new_balance,
        description=f"Expense: {expense.reason[:80]}",
        actor_name=approver.name,
    )
    db.add(ledger_entry)
    await db.commit()

    try:
        transfer_result = await nomba_client.transfer_to_bank(
            amount_naira=float(expense.amount),
            account_number=expense.recipient_account,
            account_name=expense.recipient_name,
            bank_code=expense.recipient_bank_code,
            expense_id=expense.id,  # this is the idempotency key (merchantTxRef)
            narration=narration,
            sender_name=collective.name,
        )
    except Exception as exc:
        logger.error("Transfer call failed for expense %s: %s", expense_id, exc)
        expense.status = "failed"
        await _reverse_expense_debit(expense, db)
        await db.commit()
        raise

    transfer_status = transfer_result.get("status", "PENDING")
    expense.nomba_transfer_id = transfer_result.get("id")

    if transfer_status == "SUCCESS":
        expense.status = "paid"
    elif transfer_status in ("FAILED", "REFUND"):
        expense.status = "failed"
        await _reverse_expense_debit(
            expense, db,
            entry_type="expense_refunded" if transfer_status == "REFUND" else "expense_failed",
        )
    else:
        expense.status = "disbursing"
        asyncio.create_task(_poll_transfer_status(expense.id, expense.nomba_transfer_id))

    await db.commit()
    return expense


async def _poll_transfer_status(expense_id: str, transfer_ref: str) -> None:
    """Poll Nomba requery endpoint until terminal status. Runs as a background task."""
    from app.database import AsyncSessionLocal

    for attempt in range(1, MAX_REQUERY_ATTEMPTS + 1):
        await asyncio.sleep(REQUERY_INTERVAL_SECONDS)
        try:
            result = await nomba_client.requery_transaction(transfer_ref)
            status = result.get("status", "PENDING")

            async with AsyncSessionLocal() as db:
                expense_result = await db.execute(select(Expense).where(Expense.id == expense_id))
                expense = expense_result.scalar_one_or_none()
                if not expense:
                    return

                if status == "SUCCESS":
                    expense.status = "paid"
                    await db.commit()
                    logger.info("Expense %s confirmed paid", expense_id)
                    return
                elif status in ("FAILED", "REFUND"):
                    expense.status = "failed"
                    await _reverse_expense_debit(
                        expense, db,
                        entry_type="expense_refunded" if status == "REFUND" else "expense_failed",
                    )
                    await db.commit()
                    logger.warning("Expense %s transfer %s", expense_id, status.lower())
                    return

            logger.info("Expense %s still PENDING (attempt %d/%d)", expense_id, attempt, MAX_REQUERY_ATTEMPTS)
        except Exception as exc:
            logger.error("Requery attempt %d failed for %s: %s", attempt, expense_id, exc)

    # exceeded max attempts
    async with AsyncSessionLocal() as db:
        expense_result = await db.execute(select(Expense).where(Expense.id == expense_id))
        expense = expense_result.scalar_one_or_none()
        if expense:
            expense.status = "manual_review"
            await db.commit()
    logger.error("Expense %s flagged manual_review after %d attempts", expense_id, MAX_REQUERY_ATTEMPTS)
