# Evident
An open financial tracking platform designed to eliminate corruption by showing members exactly where group money goes in real time.

## Architecture & Security

Evident is built so that the **bank account is the source of truth**, not a person. Money flows through Nomba virtual accounts, and Evident records every movement to a public, append-only ledger that members can read in real time.

### Authentication

- **Nomba API access** uses OAuth2 with the `client_credentials` grant. A token is issued at startup and refreshed before expiry; all calls to Nomba (virtual accounts, transfers, transaction lookups) carry the current bearer token.
- **Credentials are never committed.** `NOMBA_CLIENT_ID`, `NOMBA_PRIVATE_KEY`, account IDs, and the webhook signature key live only in `backend/.env` (see `.env.example` for the shape). Nothing sensitive is exposed to the frontend.

### Webhooks

- Nomba delivers payment events server-to-server to `POST /webhooks/nomba`. This is the primary path by which contributions reach the ledger — the backend must be publicly reachable for delivery to succeed.
- **Signature verification (HMAC-SHA256):** when `NOMBA_SIGNATURE_KEY` is configured, each webhook is verified against the `nomba-signature` header (with `nomba-timestamp`). The signed message is the colon-joined event fields, base64-encoded, per Nomba's spec. Unsigned/invalid requests are rejected with `401`. Verification stays off only while no signing key has been issued.
- **Idempotency:** every payment carries a unique `source_transfer_id`. The handler skips any event whose id was already recorded, so retries and duplicate deliveries can never double-count money.
- **Resilient acknowledgement:** processing errors are logged and still return `200`, so Nomba doesn't retry indefinitely; the event is captured for manual review instead of being lost.
- **Reconciliation fallback:** a scheduled sweep (every 15 minutes) polls Nomba's transaction history per collective and flags any payment that never arrived via webhook, closing the gap if a delivery is missed.

### Data handling

- **Append-only ledger.** Financial rows are never updated or deleted. Each contribution or expense writes a new `ledger_entries` row with the running `balance_after`, giving an immutable audit trail.
- **Payment matching & review queue.** Incoming transfers are matched to a member before being credited. Anything that can't be matched is filed in an unmatched-review queue rather than silently attached — a human resolves it to a member.
- **Under/over-payment is preserved, not overwritten.** Payments are classified `partial`, `exact`, or `excess` against the expected dues, and the shortfall/overage is described on the ledger entry rather than being adjusted away.
- **Expenses require justification and approval.** A disbursement needs a stated reason and a receipt, and is only paid out via Nomba Transfers after committee approval — with recipient bank-account validation before the payout.
- **Transport.** CORS is enforced at the API layer; production deployments should serve both frontend and backend over HTTPS so tokens and payloads are never sent in the clear.
