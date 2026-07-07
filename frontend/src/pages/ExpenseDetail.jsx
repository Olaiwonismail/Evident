import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime, groupDigits } from "../lib/format.js";
import { Card, Button, Input, Spinner, StatusBadge, ErrorNote } from "../components/ui.jsx";

// The full story of one request: who asked, who decided (and why), and
// whether the money actually moved. This is where members follow an expense.
export default function ExpenseDetail() {
  const { collectiveId, me, isCommittee } = useOutletContext();
  const { expenseId } = useParams();
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["expense", collectiveId, expenseId],
    queryFn: () => api.getExpense(collectiveId, expenseId),
    refetchInterval: 15_000,
  });
  // the backend stores only the bank code — resolve its display name
  const banks = useQuery({
    queryKey: ["banks", collectiveId],
    queryFn: () => api.getBanks(collectiveId),
    staleTime: Infinity,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expense", collectiveId, expenseId] });
    queryClient.invalidateQueries({ queryKey: ["expenses", collectiveId] });
    queryClient.invalidateQueries({ queryKey: ["ledger", collectiveId] });
  };
  const approve = useMutation({
    mutationFn: () => api.approveExpense(collectiveId, expenseId, me.id),
    onSuccess: refresh,
  });
  const reject = useMutation({
    mutationFn: (reason) => api.rejectExpense(collectiveId, expenseId, me.id, reason),
    onSuccess: refresh,
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError)
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        Expense not found.{" "}
        <Link className="text-emerald-600 underline" to={`/c/${collectiveId}/expenses`}>
          Back to expenses
        </Link>
      </div>
    );

  const e = q.data;
  const bank = (banks.data || []).find(
    (b) => (b.bankCode || b.code) === e.recipient_bank_code
  );
  const bankName = e.recipient_bank_name || bank?.bankName || bank?.name || e.recipient_bank_code;
  const canDecide = isCommittee && e.status === "pending" && me?.id !== e.requested_by;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to={`/c/${collectiveId}/expenses`}
        className="text-sm text-slate-400 hover:text-slate-600"
      >
        ← All expenses
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-3xl font-extrabold tracking-tight">{naira(e.amount)}</p>
            <p className="mt-1 text-sm font-medium text-slate-700">{e.reason}</p>
          </div>
          <StatusBadge status={e.status} />
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-400">Recipient</dt>
            <dd className="mt-1 text-sm font-medium">{e.recipient_name}</dd>
            <dd className="text-xs text-slate-400">
              {groupDigits(e.recipient_account)} · {bankName}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-400">Receipt</dt>
            <dd className="mt-1 text-sm">
              {e.receipt_url ? (
                <a
                  href={e.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-emerald-600 hover:underline"
                >
                  View receipt ↗
                </a>
              ) : (
                <span className="text-slate-400">None attached</span>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">History</h2>
        <Timeline expense={e} />
      </Card>

      {canDecide && (
        <Card className="border-amber-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700">Your decision</h2>
          <p className="mt-1 text-xs text-slate-400">
            Approving disburses {naira(e.amount)} to {e.recipient_name} immediately, with your name
            on the ledger.
          </p>
          <DecisionControls approve={approve} reject={reject} />
        </Card>
      )}
    </div>
  );
}

function Timeline({ expense: e }) {
  const steps = [
    {
      done: true,
      tone: "bg-emerald-500",
      title: `Requested by ${e.requested_by_name}`,
      when: e.timestamp,
    },
  ];

  if (e.status === "pending") {
    steps.push({
      done: false,
      tone: "bg-amber-400 animate-pulse",
      title: "Waiting on the committee",
      sub: "Any committee member can approve or reject.",
    });
  } else if (e.status === "rejected") {
    steps.push({
      done: true,
      tone: "bg-red-500",
      title: `Rejected by ${e.decided_by_name}`,
      sub: e.decision_reason ? `"${e.decision_reason}"` : null,
      when: e.decided_at,
    });
  } else {
    steps.push({
      done: true,
      tone: "bg-emerald-500",
      title: `Approved by ${e.decided_by_name}`,
      when: e.decided_at,
    });
    if (e.status === "failed") {
      steps.push({
        done: true,
        tone: "bg-red-500",
        title: "Payout failed — money returned to the pool",
        sub: e.failure_reason,
      });
    } else if (e.status === "manual_review") {
      steps.push({
        done: false,
        tone: "bg-purple-400",
        title: "Transfer status unclear — flagged for manual review",
        sub: "The payout is being confirmed with the bank before the ledger is updated.",
      });
    } else if (e.status === "disbursing") {
      steps.push({
        done: false,
        tone: "bg-blue-400 animate-pulse",
        title: "Disbursing…",
        sub: `Sending to ${e.recipient_name}.`,
      });
    } else {
      steps.push({
        done: true,
        tone: "bg-emerald-500",
        title: `Paid to ${e.recipient_name}`,
        when: e.paid_at,
      });
    }
  }

  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && (
            <span className="absolute left-[5px] top-4 h-full w-px bg-slate-200" />
          )}
          <span className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ${s.tone}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{s.title}</p>
            {s.sub && <p className="mt-0.5 text-xs text-slate-500">{s.sub}</p>}
            {s.when && <p className="mt-0.5 text-xs text-slate-400">{formatTime(s.when)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DecisionControls({ approve, reject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-3">
        <Button disabled={busy} onClick={() => approve.mutate()}>
          {approve.isPending ? "Disbursing…" : "Approve & pay"}
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => setRejecting(!rejecting)}>
          Reject
        </Button>
      </div>
      {rejecting && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Reason for rejection — goes on the public ledger"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button variant="danger" disabled={!reason || busy} onClick={() => reject.mutate(reason)}>
            Confirm reject
          </Button>
        </div>
      )}
      <ErrorNote error={approve.error || reject.error} />
    </div>
  );
}
