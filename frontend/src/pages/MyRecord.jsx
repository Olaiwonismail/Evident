import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime } from "../lib/format.js";
import { Card, CardHeader, Button, Spinner, EmptyState, StatusBadge } from "../components/ui.jsx";

// A member's personal view: what they've paid, what they still owe, and
// their full contribution history.
export default function MyRecord() {
  const { collectiveId, me } = useOutletContext();

  const q = useQuery({
    queryKey: ["contributions", collectiveId, me?.id],
    queryFn: () => api.getContributions(collectiveId, me.id),
    enabled: !!me,
    refetchInterval: 15_000,
  });

  if (!me) {
    return (
      <Card>
        <EmptyState
          icon="🔑"
          title="Open your personal link to see your record"
          subtitle="Your contribution history is tied to who you are in the collective."
        />
      </Card>
    );
  }

  if (q.isLoading) return <Spinner />;
  const { dues_amount, dues_frequency, total_paid = 0, contributions = [] } = q.data || {};
  const pct = dues_amount ? Math.min(100, Math.round((total_paid / dues_amount) * 100)) : null;
  const owed = dues_amount ? Math.max(0, dues_amount - total_paid) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400">Total paid</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{naira(total_paid)}</p>
          {pct !== null && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {pct >= 100 ? "Dues covered ✓" : `${pct}% of ${naira(dues_amount)}`}
              </p>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400">Still owed</p>
          <p className={`mt-1 text-2xl font-bold ${owed ? "text-amber-600" : ""}`}>
            {owed === null ? "—" : owed === 0 ? "₦0 ✓" : naira(owed)}
          </p>
          {dues_frequency && dues_amount && (
            <p className="text-xs text-slate-400">
              of {naira(dues_amount)} {dues_frequency}
            </p>
          )}
          {owed > 0 && (
            <Link to={`/c/${collectiveId}/pay`} className="mt-3 block">
              <Button className="w-full">Pay now</Button>
            </Link>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400">Payments made</p>
          <p className="mt-1 text-2xl font-bold">{contributions.length}</p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Your contributions"
          subtitle="Pay from the bank account whose number matches your registered phone number so we can recognise you automatically."
        />
        {contributions.length === 0 ? (
          <EmptyState
            icon="💸"
            title="No contributions yet"
            subtitle="Transfers you make will show up here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {contributions.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-semibold">{naira(c.amount)}</p>
                  <p className="text-xs text-slate-400">{formatTime(c.timestamp)}</p>
                </div>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
