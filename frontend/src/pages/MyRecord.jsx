import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, CircleDollarSign } from "lucide-react";
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
          icon={KeyRound}
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
      {/* One record panel, not three stat cards: paid leads with a progress
          meter; owed and count trail as supporting facts. */}
      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Total paid</p>
            <p className="font-mono text-3xl font-bold tabular-nums text-pos-ink">{naira(total_paid)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted">
              {owed === 0 ? "Status" : "Still owed"}
            </p>
            <p className={`font-mono text-xl font-semibold tabular-nums ${owed ? "text-warn-ink" : "text-pos-ink"}`}>
              {owed === null ? "—" : owed === 0 ? "up to date" : naira(owed)}
            </p>
          </div>
        </div>
        {pct !== null && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-pos transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
              <span>
                {pct >= 100 ? "Dues covered" : `${pct}% of ${naira(dues_amount)} ${dues_frequency || ""}`}
              </span>
              <span>
                {contributions.length} payment{contributions.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        )}
        {owed > 0 && (
          <Link to={`/c/${collectiveId}/pay`} className="mt-5 block sm:inline-block">
            <Button className="w-full sm:w-auto">Pay now</Button>
          </Link>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Your contributions"
          subtitle="Pay from the bank account whose number matches your registered phone number so we can recognise you automatically."
        />
        {contributions.length === 0 ? (
          <EmptyState
            icon={CircleDollarSign}
            title="No contributions yet"
            subtitle="Transfers you make will show up here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {contributions.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono text-sm font-semibold tabular-nums text-ink">{naira(c.amount)}</p>
                  <p className="text-xs text-muted">{formatTime(c.timestamp)}</p>
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
