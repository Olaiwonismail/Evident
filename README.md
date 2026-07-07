# Evident
An open financial tracking platform designed to eliminate corruption by showing members exactly where group money goes in real time.

## Architecture & Security

Evident is built so that the **bank account is the source of truth**, not a person. Money flows through Nomba virtual accounts, and Evident records every movement to a public, append-only ledger that members can read in real time.

### Authentication

- **Nomba API access** uses OAuth2 with the `client_credentials` grant. A token is issued at startup and refreshed before expiry; all calls to Nomba (virtual accounts, transfers, transaction lookups) carry the current bearer token.
- **Credentials are never committed.** `NOMBA_CLIENT_ID`, `NOMBA_PRIVATE_KEY`, account IDs, and the webhook signature key live only in `backend/.env` (see `.env.example` for the shape). Nothing sensitive is exposed to the frontend.

### Webhooks

- Nomba delivers payment events server-to-server to `POST /webhooks/nomba`. This is the primary path by which contributions reach the ledger, and the backend must be publicly reachable for delivery to succeed.
- **Signature verification (HMAC-SHA256):** when `NOMBA_SIGNATURE_KEY` is configured, each webhook is verified against the `nomba-signature` header (with `nomba-timestamp`). The signed message is the colon-joined event fields, base64-encoded, per Nomba's spec. Unsigned/invalid requests are rejected with `401`. Verification stays off only while no signing key has been issued.
- **Idempotency:** every payment carries a unique `source_transfer_id`. The handler skips any event whose id was already recorded, so retries and duplicate deliveries can never double-count money.
- **Resilient acknowledgement:** processing errors are logged and still return `200`, so Nomba doesn't retry indefinitely; the event is captured for manual review instead of being lost.
- **Reconciliation fallback:** a scheduled sweep (every 15 minutes) polls Nomba's transaction history per collective and flags any payment that never arrived via webhook, closing the gap if a delivery is missed.

### Data handling

- **Append-only ledger.** Financial rows are never updated or deleted. Each contribution or expense writes a new `ledger_entries` row with the running `balance_after`, giving an immutable audit trail.
- **Payment matching & review queue.** Incoming transfers are matched to a member before being credited. Anything that can't be matched is filed in an unmatched-review queue rather than silently attached, so a human resolves it to a member.
- **Under/over-payment is preserved, not overwritten.** Payments are classified `partial`, `exact`, or `excess` against the expected dues, and the shortfall/overage is described on the ledger entry rather than being adjusted away.
- **Expenses require justification and approval.** A disbursement needs a stated reason and a receipt, and is only paid out via Nomba Transfers after committee approval, with recipient bank-account validation before the payout.
- **Transport.** CORS is enforced at the API layer; production deployments should serve both frontend and backend over HTTPS so tokens and payloads are never sent in the clear.

## Getting Started (Running Locally)

### Prerequisites
* Node.js (v18 or higher)
* Python (3.10 or higher)
* Nomba API Credentials (for real transactions, otherwise use Demo Mode)

### Backend Setup
1. Navigate to the backend directory: `cd backend`
2. Create a virtual environment: `python -m venv venv`
3. Activate it: `source venv/bin/activate` (or `venv\Scripts\activate` on Windows)
4. Install dependencies: `pip install -r requirements.txt`
5. Configure your environment: Copy `.env.example` to `.env` and add your Nomba API credentials.
6. Start the server: `uvicorn app.main:app --reload`

### Frontend Setup
1. Navigate to the frontend directory: `cd frontend`
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`

## Testing & Demo Mode

The quickest way to evaluate the platform without deploying the full backend is via the built-in **Demo Mode**.

- **Interactive Demo:** Navigate to `https://evident-rose.vercel.app/c/demo?m=m1` (or click "Explore the live demo" on the landing page) to interact with a seeded, in-memory dataset.
- **Simulated Transfers:** Within the demo collective, navigate to the "Pay Dues" page and click the simulation button. This perfectly mimics the server-side Nomba webhook flow, allowing you to watch the ledger update in real-time.
- **Role Switching:** Use the demo widget to seamlessly toggle your view between an ordinary Member, the Treasurer, or a Committee Member to verify permission constraints and UI changes.
- **Backend Testing:** A local test script (`backend/test_webhook_flow.py`) is provided to simulate inbound Nomba webhook payloads against a local database (`test_webhook.db`), allowing you to test the reconciliation logic without requiring live API credentials.

## How to Use Evident (User Guide)

### 1. For Organizers & Treasurers
* **Create a Collective:** Start by creating your group. Evident instantly provisions a dedicated Nomba virtual bank account solely for your collective's funds.
* **Invite Members:** Add your community members and optionally elevate trusted individuals to "Committee" status to help oversee spending.
* **Manage Unmatched Payments:** If a transfer arrives but cannot be automatically linked to a user, it enters a manual review queue where you can easily assign it to the correct member.

### 2. For Members
* **Pay Dues Seamlessly:** Log into your dashboard to view upcoming dues. Copy your group's unique virtual account number and make a standard bank transfer from any Nigerian bank.
* **Instant Verification:** Once the transfer clears, Nomba webhooks automatically update the platform. Your status turns green instantly; no need to send screenshots to a treasurer.
* **Track the Ledger:** At any time, check the live ledger to see the group's total balance, who has paid, and a permanent record of all incoming and outgoing funds.

### 3. Approving Expenses & Payouts
* **Submit an Expense:** When the group needs to spend money, the Treasurer drafts an expense by entering the recipient's bank details, a stated reason, and uploading a receipt.
* **Committee Approval:** The expense remains locked in a "Pending" state until the designated Committee Members review and approve it.
* **Automated Payout:** Once fully approved, Evident triggers a secure Nomba Transfer to disburse the funds directly to the recipient, recording the approved expense permanently on the ledger.
