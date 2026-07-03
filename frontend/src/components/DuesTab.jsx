import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime } from "../lib/format.js";
import { Card, CardHeader, Spinner, EmptyState, StatusBadge } from "./ui.jsx";

export default function DuesTab({ collectiveId, me }) {
  const q = useQuery({
    queryKey: ["contributions", collectiveId, me.id],
    queryFn: () => api.getContributions(collectiveId, me.id),
    refetchInterval: 15_000,
  });

  if (q.isLoading) return <Spinner />;
  const { dues_amount, dues_frequency, total_paid = 0, contributions = [] } = q.data || {};
  const pct = dues_amount ? Math.min(100, Math.round((total_paid / dues_amount) * 100)) : null;

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
          <p className="text-xs uppercase tracking-wider text-slate-400">Expected dues</p>
          <p className="mt-1 text-2xl font-bold">
            {dues_amount ? naira(dues_amount) : "—"}
          </p>
          {dues_frequency && <p className="text-xs text-slate-400">{dues_frequency}</p>}
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
