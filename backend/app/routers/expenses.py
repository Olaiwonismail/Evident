from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.expense import Expense
from app.models.collective import Collective
from app.services import nomba_client, disbursement

router = APIRouter(prefix="/collectives", tags=["expenses"])


class SubmitExpenseRequest(BaseModel):
    requested_by: str  # member id
    amount: float
    reason: str
    receipt_url: str | None = None
    recipient_account: str
    recipient_bank_code: str


class ApproveExpenseRequest(BaseModel):
    approver_id: str


class RejectExpenseRequest(BaseModel):
    approver_id: str
    reason: str


@router.post("/{collective_id}/expenses")
async def submit_expense(collective_id: str, body: SubmitExpenseRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Collective).where(Collective.id == collective_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Collective not found")

    # validate recipient account before saving
    try:
        lookup = await nomba_client.lookup_bank_account(body.recipient_account, body.recipient_bank_code)
        recipient_name = lookup.get("accountName")
        if not recipient_name:
            raise HTTPException(status_code=422, detail="Could not verify recipient account")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Bank account lookup failed: {exc}")

    expense = Expense(
        collective_id=collective_id,
        requested_by=body.requested_by,
        amount=body.amount,
        reason=body.reason,
        receipt_url=body.receipt_url,
        recipient_account=body.recipient_account,
        recipient_name=recipient_name,
        recipient_bank_code=body.recipient_bank_code,
    )
    db.add(expense)
    await db.commit()
    return {
        "id": expense.id,
        "status": expense.status,
        "recipient_name": recipient_name,
        "amount": expense.amount,
    }


@router.get("/{collective_id}/expenses")
async def list_expenses(collective_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Expense)
        .where(Expense.collective_id == collective_id)
        .order_by(Expense.timestamp.desc())
    )
    expenses = result.scalars().all()
    return [
        {
            "id": e.id,
            "amount": float(e.amount),
            "reason": e.reason,
            "status": e.status,
            "recipient_name": e.recipient_name,
            "approved_by": e.approved_by,
            "timestamp": e.timestamp.isoformat(),
        }
        for e in expenses
    ]


@router.post("/{collective_id}/expenses/{expense_id}/approve")
async def approve_expense(
    collective_id: str,
    expense_id: str,
    body: ApproveExpenseRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        expense = await disbursement.disburse_expense(expense_id, body.approver_id, db)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"id": expense.id, "status": expense.status}


@router.post("/{collective_id}/expenses/{expense_id}/reject")
async def reject_expense(
    collective_id: str,
    expense_id: str,
    body: RejectExpenseRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalar_one_or_none()
    if not expense or expense.status != "pending":
        raise HTTPException(status_code=404, detail="Expense not found or not pending")

    expense.status = "rejected"
    expense.approved_by = body.approver_id
    expense.rejection_reason = body.reason
    await db.commit()
    return {"id": expense.id, "status": "rejected", "reason": body.reason}
