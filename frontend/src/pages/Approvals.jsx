import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime } from "../lib/format.js";
import { Card, CardHeader, Button, Spinner, EmptyState, ErrorNote } from "../components/ui.jsx";

// The committee member's inbox. Approving here is what sets the real payout
// in motion — every decision carries the decider's name.
export default function Approvals() {
  const { collectiveId, me, isCommittee } = useOutletContext();
  const queryClient = useQueryClient();

  const expenses = useQuery({
    queryKey: ["expenses", collectiveId],
    queryFn: () => api.getExpenses(collectiveId),
    refetchInterval: 15_000,
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
    mutationFn: ({ expenseId, reason }) => api.rejectExpense(collectiveId, expenseId, me.id, reason),
    onSuccess: refresh,
  });

  if (!isCommittee) {
    return (
      <Card>
        <EmptyState
          icon="🛡️"
          title="Committee only"
          subtitle="Only committee members can approve or reject expense requests."
        />
      </Card>
    );
  }

  const pending = (expenses.data || []).filter((e) => e.status === "pending");
  const decided = (expenses.data || []).filter((e) => e.status !== "pending").slice(0, 5);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={`Awaiting your approval${pending.length ? ` (${pending.length})` : ""}`}
          subtitle="Approving disburses the money to the verified recipient immediately — your name goes on the ledger."
        />
        {expenses.isLoading ? (
          <Spinner />
        ) : pending.length === 0 ? (
          <EmptyState icon="✅" title="Nothing pending" subtitle="New expense requests will land here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((e) => (
              <PendingRow
                key={e.id}
                expense={e}
                collectiveId={collectiveId}
                me={me}
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

      {decided.length > 0 && (
        <Card>
          <CardHeader title="Recently decided" subtitle="The last few calls the committee made." />
          <ul className="divide-y divide-slate-100">
            {decided.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/c/${collectiveId}/expenses/${e.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.reason}</p>
                    <p className="text-xs text-slate-400">
                      {e.status === "rejected" ? "rejected" : "approved"} by {e.decided_by_name}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums">{naira(e.amount)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function PendingRow({ expense, collectiveId, me, approve, reject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = approve.isPending || reject.isPending;
  const isOwn = expense.requested_by === me.id;

  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/c/${collectiveId}/expenses/${expense.id}`} className="min-w-0 flex-1 hover:underline">
          <p className="text-sm font-medium">{expense.reason}</p>
          <p className="text-xs text-slate-400">
            to {expense.recipient_name} · requested by {expense.requested_by_name} ·{" "}
            {formatTime(expense.timestamp)}
          </p>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold tabular-nums">{naira(expense.amount)}</p>
          {isOwn ? (
            <p className="text-xs italic text-slate-400">your own request — someone else decides</p>
          ) : (
            <>
              <Button disabled={busy} onClick={() => approve.mutate(expense.id)}>
                {approve.isPending ? "Disbursing…" : "Approve & pay"}
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => setRejecting(!rejecting)}>
                Reject
              </Button>
            </>
          )}
        </div>
      </div>
      {rejecting && !isOwn && (
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Reason for rejection — goes on the public ledger"
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
