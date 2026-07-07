import { Link, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime } from "../lib/format.js";
import { Card, CardHeader, Button, Spinner, EmptyState, StatusBadge } from "../components/ui.jsx";

export default function Expenses() {
  const { collectiveId, me } = useOutletContext();
  const expenses = useQuery({
    queryKey: ["expenses", collectiveId],
    queryFn: () => api.getExpenses(collectiveId),
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader
        title="Expense requests"
        subtitle="Money only leaves the pool with a public reason and committee approval."
        action={
          me ? (
            <Link to={`/c/${collectiveId}/expenses/new`}>
              <Button>+ New request</Button>
            </Link>
          ) : null
        }
      />
      {expenses.isLoading ? (
        <Spinner />
      ) : (expenses.data || []).length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No expenses yet"
          subtitle="Requests submitted by members appear here."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {expenses.data.map((e) => (
            <li key={e.id}>
              <Link
                to={`/c/${collectiveId}/expenses/${e.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.reason}</p>
                  <p className="text-xs text-slate-400">
                    to {e.recipient_name} · requested by {e.requested_by_name} ·{" "}
                    {formatTime(e.timestamp)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-sm font-bold tabular-nums">{naira(e.amount)}</p>
                  <StatusBadge status={e.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
