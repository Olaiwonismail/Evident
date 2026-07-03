import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime } from "../lib/format.js";
import { Card, Spinner, EmptyState, StatusBadge } from "./ui.jsx";

export default function DuesTab({ collectiveId, me }) {
  const q = useQuery({
    queryKey: ["contributions", collectiveId, me.id],
    queryFn: () => api.getContributions(collectiveId, me.id),
    refetchInterval: 15_000,
  });

  if (q.isLoading) return <Spinner />;
  const { dues_amount, dues_frequency, total_paid = 0, contributions = [] } = q.data || {};

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-slate-400">Total paid</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{naira(total_paid)}</p>
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
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">Your contributions</h2>
          <p className="text-xs text-slate-400">
            Pay from the bank account whose number matches your registered phone number so we can
            recognise you automatically.
          </p>
        </div>
        {contributions.length === 0 ? (
          <EmptyState title="No contributions yet" subtitle="Transfers you make will show up here." />
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
