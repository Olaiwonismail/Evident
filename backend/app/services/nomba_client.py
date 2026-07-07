import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


def _parse_expires_at(value: str) -> datetime:
    """Nomba returns expiresAt as an ISO timestamp like 2026-07-03T00:54:40.287Z."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    # naive UTC to match datetime.utcnow() comparisons; refresh 60s early
    return dt.astimezone(timezone.utc).replace(tzinfo=None) - timedelta(seconds=60)


class NombaToken:
    access_token: str = ""
    refresh_token: str = ""
    expires_at: datetime = datetime.utcnow()


_token = NombaToken()
_token_lock = asyncio.Lock()


async def _issue_token() -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.nomba_base_url}/v1/auth/token/issue",
            json={
                "grant_type": "client_credentials",
                "client_id": settings.nomba_client_id,
                "client_secret": settings.nomba_private_key,
            },
            headers={"accountId": settings.nomba_account_id},
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        _token.access_token = data["access_token"]
        _token.refresh_token = data["refresh_token"]
        _token.expires_at = _parse_expires_at(data["expiresAt"])
        logger.info("Nomba token issued, expires at %s", _token.expires_at)


async def _refresh_token() -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.nomba_base_url}/v1/auth/token/refresh",
            json={"refresh_token": _token.refresh_token},
            headers={"accountId": settings.nomba_account_id},
        )
        if resp.status_code != 200:
            logger.warning("Token refresh failed, re-issuing")
            await _issue_token()
            return
        data = resp.json()["data"]
        _token.access_token = data["access_token"]
        _token.refresh_token = data.get("refresh_token", _token.refresh_token)
        _token.expires_at = _parse_expires_at(data["expiresAt"])
        logger.info("Nomba token refreshed")


async def get_token() -> str:
    async with _token_lock:
        if datetime.utcnow() >= _token.expires_at:
            if _token.refresh_token:
                await _refresh_token()
            else:
                await _issue_token()
    return _token.access_token


def _auth_headers() -> dict:
    return {
        "Authorization": _token.access_token,
        "accountId": settings.nomba_account_id,
    }


async def _get(path: str, params: dict = None) -> dict:
    await get_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.nomba_base_url}{path}",
            headers=_auth_headers(),
            params=params,
        )
        resp.raise_for_status()
        return resp.json()


async def _post(path: str, body: dict) -> dict:
    await get_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.nomba_base_url}{path}",
            json=body,
            headers=_auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Virtual Accounts ──────────────────────────────────────────────────────────

async def create_virtual_account(collective_id: str, collective_name: str, callback_url: str) -> dict:
    data = await _post("/v1/accounts/virtual", {
        "accountRef": collective_id,
        "accountName": collective_name,
        "currency": "NGN",
        "callbackUrl": callback_url,
        # deliberately NOT setting expectedAmount — Evident handles reconciliation itself
    })
    return data["data"]


async def create_member_virtual_account(
    member_id: str, member_name: str, collective_name: str, callback_url: str
) -> dict:
    """A dedicated pay-in account for a single member. accountRef is prefixed so
    the webhook can tell a member account apart from a collective account."""
    data = await _post("/v1/accounts/virtual", {
        "accountRef": f"mbr_{member_id}",
        "accountName": f"{member_name} - {collective_name}"[:50],
        "currency": "NGN",
        "callbackUrl": callback_url,
    })
    return data["data"]


async def fetch_virtual_account(account_ref: str) -> dict:
    data = await _get(f"/v1/accounts/virtual/{account_ref}")
    return data["data"]


async def fetch_virtual_account_transactions(
    account_number: str,
    start_date: str,
    end_date: str,
) -> list:
    data = await _get(
        f"/v1/accounts/virtual/{account_number}/transactions",
        params={"startDate": start_date, "endDate": end_date},
    )
    return data.get("data", {}).get("transactions", [])


# ── Transfers ─────────────────────────────────────────────────────────────────

async def lookup_bank_account(account_number: str, bank_code: str) -> dict:
    data = await _post("/v1/transfers/bank/lookup", {
        "accountNumber": account_number,
        "bankCode": bank_code,
    })
    return data["data"]


async def fetch_banks() -> list:
    data = await _get("/v1/transfers/banks")
    return data.get("data", [])


async def transfer_to_bank(
    amount_naira: float,
    account_number: str,
    account_name: str,
    bank_code: str,
    expense_id: str,
    narration: str,
    sender_name: str = "Evident",
) -> dict:
    data = await _post("/v2/transfers/bank", {
        "amount": round(amount_naira, 2),  # per developer.nomba.com, amount is in naira
        "accountNumber": account_number,
        "accountName": account_name,
        "bankCode": bank_code,
        "merchantTxRef": expense_id,  # idempotency key — always the expense UUID
        "senderName": sender_name[:50],  # shown on the recipient's bank statement
        "narration": narration,
    })
    return data["data"]


# ── Transactions ──────────────────────────────────────────────────────────────

async def fetch_account_transactions(
    start_date: str,
    end_date: str,
    cursor: Optional[str] = None,
    limit: int = 50,
) -> dict:
    params = {"startDate": start_date, "endDate": end_date, "limit": limit}
    if cursor:
        params["cursor"] = cursor
    data = await _get("/v1/transactions/accounts", params=params)
    return data.get("data", {})


async def requery_transaction(transaction_ref: str) -> dict:
    data = await _post("/v1/transactions/accounts", {"transactionRef": transaction_ref})
    return data.get("data", {})
