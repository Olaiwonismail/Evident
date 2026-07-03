from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.collective import Collective
from app.models.member import Member
from app.services import nomba_client
from app.config import settings

router = APIRouter(prefix="/collectives", tags=["collectives"])


class CreateCollectiveRequest(BaseModel):
    name: str
    purpose: str
    dues_amount: float | None = None
    dues_frequency: str | None = None
    organizer_name: str
    organizer_email: str | None = None
    organizer_phone: str | None = None


class InviteMemberRequest(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    role: str = "member"


@router.post("")
async def create_collective(body: CreateCollectiveRequest, db: AsyncSession = Depends(get_db)):
    import uuid
    collective_id = str(uuid.uuid4())

    # Create organizer member first
    organizer = Member(
        id=str(uuid.uuid4()),
        collective_id=collective_id,
        name=body.organizer_name,
        email=body.organizer_email,
        phone=body.organizer_phone,
        role="organizer",
    )

    collective = Collective(
        id=collective_id,
        name=body.name,
        purpose=body.purpose,
        dues_amount=body.dues_amount,
        dues_frequency=body.dues_frequency,
        created_by=organizer.id,
    )
    db.add(collective)
    db.add(organizer)
    await db.flush()

    callback_url = f"{settings.app_base_url}/webhooks/nomba"
    try:
        va = await nomba_client.create_virtual_account(collective_id, body.name, callback_url)
        # sandbox VA responses carry no accountId/walletId — fall back to the NUBAN
        collective.virtual_account_id = va.get("accountId") or va.get("walletId") or va.get("bankAccountNumber")
        collective.bank_account_number = va.get("bankAccountNumber")
        collective.bank_name = va.get("bankName")
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=502, detail=f"Nomba virtual account creation failed: {exc}")

    await db.commit()
    return {
        "id": collective.id,
        "name": collective.name,
        "bank_account_number": collective.bank_account_number,
        "bank_name": collective.bank_name,
        "organizer_id": organizer.id,
    }


@router.get("/{collective_id}")
async def get_collective(collective_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Collective).where(Collective.id == collective_id))
    collective = result.scalar_one_or_none()
    if not collective:
        raise HTTPException(status_code=404, detail="Collective not found")
    return collective


@router.post("/{collective_id}/members")
async def invite_member(collective_id: str, body: InviteMemberRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Collective).where(Collective.id == collective_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Collective not found")

    member = Member(
        collective_id=collective_id,
        name=body.name,
        email=body.email,
        phone=body.phone,
        role=body.role,
    )
    db.add(member)
    await db.commit()
    return {"id": member.id, "name": member.name, "role": member.role}


@router.get("/{collective_id}/members")
async def list_members(collective_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Member).where(Member.collective_id == collective_id))
    return result.scalars().all()
