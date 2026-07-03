import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime } from "../lib/format.js";
import { Card, Button, Spinner, EmptyState, ErrorNote, Badge } from "./ui.jsx";

export default function ApprovalsTab({ collectiveId, me }) {
  const queryClient = useQueryClient();
  const expenses = useQuery({
    queryKey: ["expenses", collectiveId],
    queryFn: () => api.getExpenses(collectiveId),
    refetchInterval: 15_000,
  });
  const unmatched = useQuery({
    queryKey: ["unmatched", collectiveId],
    queryFn: () => api.getUnmatched(collectiveId),
    refetchInterval: 30_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses", collectiveId] });
    queryClient.invalidateQueries({ queryKey: ["ledger", collectiveId] });
  };

  const approve = useMutation({
    mutationFn: (expenseId) => api.approveExpense(collectiveId, expenseId, me.id),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: ({ expenseId, reason }) =>
      api.rejectExpense(collectiveId, expenseId, me.id, reason),
    onSuccess: refresh,
  });

  const pending = (expenses.data || []).filter((e) => e.status === "pending");

  return (
    <div className="space-y-6">
      <Card>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">Awaiting your approval</h2>
          <p className="text-xs text-slate-400">
            Approving disburses the money to the verified recipient immediately.
          </p>
        </div>
        {expenses.isLoading ? (
          <Spinner />
        ) : pending.length === 0 ? (
          <EmptyState title="Nothing pending" subtitle="New expense requests will land here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((e) => (
              <PendingRow
                key={e.id}
                expense={e}
                approve={approve}
                reject={reject}
              />
            ))}
          </ul>
        )}
        <div className="px-6 pb-4">
          <ErrorNote error={approve.error || reject.error} />
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">Unmatched transfers</h2>
          <p className="text-xs text-slate-400">
            Payments received that we couldn't match to a member — nothing is silently absorbed.
          </p>
        </div>
        {unmatched.isLoading ? (
          <Spinner />
        ) : (unmatched.data || []).length === 0 ? (
          <EmptyState title="All clear" subtitle="Every transfer has been matched to a member." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {unmatched.data.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium">
                    {u.sender_name || "Unknown sender"}{" "}
                    <span className="text-slate-400">({u.sender_account || "no account"})</span>
                  </p>
                  <p className="text-xs text-slate-400">{formatTime(u.timestamp)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold">{naira(u.amount)}</p>
                  <Badge tone="purple">needs review</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PendingRow({ expense, approve, reject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = approve.isPending || reject.isPending;

  return (
    <li className="px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{expense.reason}</p>
          <p className="text-xs text-slate-400">
            to {expense.recipient_name} · {formatTime(expense.timestamp)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm font-bold">{naira(expense.amount)}</p>
          <Button disabled={busy} onClick={() => approve.mutate(expense.id)}>
            {approve.isPending ? "Disbursing…" : "Approve & pay"}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => setRejecting(!rejecting)}>
            Reject
          </Button>
        </div>
      </div>
      {rejecting && (
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Reason for rejection (public)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="danger"
            disabled={!reason || busy}
            onClick={() => reject.mutate({ expenseId: expense.id, reason })}
          >
            Confirm reject
          </Button>
        </div>
      )}
    </li>
  );
}
