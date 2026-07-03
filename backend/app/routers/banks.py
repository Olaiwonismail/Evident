from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services import nomba_client

router = APIRouter(prefix="/banks", tags=["banks"])

_banks_cache: list = []


@router.get("")
async def list_banks():
    global _banks_cache
    if not _banks_cache:
        _banks_cache = await nomba_client.fetch_banks()
    return _banks_cache


@router.post("/lookup")
async def lookup_account(account_number: str, bank_code: str):
    result = await nomba_client.lookup_bank_account(account_number, bank_code)
    return result
