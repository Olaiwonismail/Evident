import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, groupDigits } from "../lib/format.js";
import { Card, CardHeader, Button, Spinner, CopyButton, StatusBadge } from "../components/ui.jsx";
import LedgerList from "../components/LedgerList.jsx";

// The screen everyone opens to: live balance, what's pending, recent
// activity, and one obvious way to pay in. The glass box at a glance.
export default function Home() {
  const { collectiveId, collective, me, isCommittee } = useOutletContext();

  const ledger = useQuery({
    queryKey: ["ledger", collectiveId],
    queryFn: () => api.getLedger(collectiveId),
    refetchInterval: 10_000, // live: payments appear without a refresh
  });
  const expenses = useQuery({
    queryKey: ["expenses", collectiveId],
    queryFn: () => api.getExpenses(collectiveId),
    refetchInterval: 15_000,
  });

  if (ledger.isLoading) return <Spinner />;
  const { balance, entries = [] } = ledger.data || {};
  const pending = (expenses.data || []).filter((e) => e.status === "pending");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col justify-between p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Collective balance
            </p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">{naira(balance ?? 0)}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live — updates automatically
            </p>
          </div>
          {me && (
            <Link to={`/c/${collectiveId}/pay`} className="mt-5 block">
              <Button className="w-full">Pay my dues</Button>
            </Link>
          )}
        </Card>

        <Card className="border-l-4 border-l-emerald-500 p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Pay dues to</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-wider text-slate-900">
            {groupDigits(collective.bank_account_number)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{collective.bank_name}</p>
            <CopyButton text={collective.bank_account_number} label="Copy number" />
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
            Transfer from any Nigerian bank — it lands on the public ledger automatically.
          </p>
        </Card>
      </div>

      {pending.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader
            title={`Pending approval (${pending.length})`}
            subtitle={
              isCommittee
                ? "These requests are waiting on the committee — including you."
                : "Money that can't move until the committee decides."
            }
            action={
              isCommittee ? (
                <Link to={`/c/${collectiveId}/approvals`}>
                  <Button>Review now</Button>
                </Link>
              ) : null
            }
          />
          <ul className="divide-y divide-amber-100">
            {pending.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/c/${collectiveId}/expenses/${e.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-3 transition-colors hover:bg-amber-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.reason}</p>
                    <p className="text-xs text-slate-400">requested by {e.requested_by_name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="text-sm font-bold tabular-nums">{naira(e.amount)}</p>
                    <StatusBadge status={e.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Recent activity"
          subtitle="The last few movements — the full history is one tap away."
          action={
            <Link
              to={`/c/${collectiveId}/ledger`}
              className="text-sm font-semibold text-emerald-600 hover:underline"
            >
              Full ledger →
            </Link>
          }
        />
        <LedgerList entries={entries} limit={5} />
      </Card>
    </div>
  );
}
