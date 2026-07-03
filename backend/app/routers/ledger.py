from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from app.database import get_db
from app.models.ledger import LedgerEntry
from app.models.collective import Collective
from app.models.contribution import Contribution
from app.models.member import Member
from app.models.unmatched import UnmatchedTransfer

router = APIRouter(prefix="/collectives", tags=["ledger"])


@router.get("/{collective_id}/ledger")
async def get_ledger(collective_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Collective).where(Collective.id == collective_id))
    collective = result.scalar_one_or_none()
    if not collective:
        raise HTTPException(status_code=404, detail="Collective not found")

    entries_result = await db.execute(
        select(LedgerEntry)
        .where(LedgerEntry.collective_id == collective_id)
        .order_by(LedgerEntry.timestamp.desc())
    )
    entries = entries_result.scalars().all()

    balance_result = await db.execute(
        select(LedgerEntry.balance_after)
        .where(LedgerEntry.collective_id == collective_id)
        .order_by(LedgerEntry.timestamp.desc())
        .limit(1)
    )
    balance = balance_result.scalar_one_or_none() or Decimal("0")

    return {
        "collective_id": collective_id,
        "name": collective.name,
        "bank_account_number": collective.bank_account_number,
        "bank_name": collective.bank_name,
        "balance": float(balance),
        "entries": [
            {
                "id": e.id,
                "type": e.type,
                "amount": float(e.amount),
                "balance_after": float(e.balance_after),
                "description": e.description,
                "actor_name": e.actor_name,
                "timestamp": e.timestamp.isoformat(),
            }
            for e in entries
        ],
    }


@router.get("/{collective_id}/unmatched")
async def list_unmatched(collective_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UnmatchedTransfer)
        .where(UnmatchedTransfer.collective_id == collective_id)
        .order_by(UnmatchedTransfer.timestamp.desc())
    )
    transfers = result.scalars().all()
    return [
        {
            "id": t.id,
            "amount": float(t.amount),
            "sender_name": t.sender_name,
            "sender_account": t.sender_account,
            "status": t.status,
            "timestamp": t.timestamp.isoformat(),
        }
        for t in transfers
    ]


@router.get("/{collective_id}/members/{member_id}/contributions")
async def get_member_contributions(collective_id: str, member_id: str, db: AsyncSession = Depends(get_db)):
    member_result = await db.execute(select(Member).where(Member.id == member_id))
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    collective_result = await db.execute(select(Collective).where(Collective.id == collective_id))
    collective = collective_result.scalar_one_or_none()

    contribs_result = await db.execute(
        select(Contribution)
        .where(Contribution.collective_id == collective_id, Contribution.member_id == member_id)
        .order_by(Contribution.timestamp.desc())
    )
    contribs = contribs_result.scalars().all()

    total_paid = sum(Decimal(str(c.amount)) for c in contribs)

    return {
        "member": {"id": member.id, "name": member.name},
        "dues_amount": float(collective.dues_amount) if collective.dues_amount else None,
        "dues_frequency": collective.dues_frequency,
        "total_paid": float(total_paid),
        "contributions": [
            {
                "id": c.id,
                "amount": float(c.amount),
                "expected_amount": float(c.expected_amount) if c.expected_amount else None,
                "status": c.status,
                "timestamp": c.timestamp.isoformat(),
            }
            for c in contribs
        ],
    }
