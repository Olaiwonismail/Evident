from fastapi import APIRouter, HTTPException
from app.services import nomba_client
from app.services.nomba_client import NombaAPIError

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
    # Nomba reports "no such account" as an HTTP 404 — turn it into a clean 400
    # the form can show, instead of an unhandled 500.
    try:
        return await nomba_client.lookup_bank_account(account_number, bank_code)
    except NombaAPIError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not verify that account — check the account number and bank. ({exc})",
        )
