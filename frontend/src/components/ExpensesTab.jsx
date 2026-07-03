import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime } from "../lib/format.js";
import {
  Card, CardHeader, Button, Input, Select, Spinner, EmptyState, StatusBadge, ErrorNote,
} from "./ui.jsx";

export default function ExpensesTab({ collectiveId, me }) {
  const [open, setOpen] = useState(false);
  const expenses = useQuery({
    queryKey: ["expenses", collectiveId],
    queryFn: () => api.getExpenses(collectiveId),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-6">
      {me && open && (
        <SubmitExpense collectiveId={collectiveId} me={me} onClose={() => setOpen(false)} />
      )}

      <Card>
        <CardHeader
          title="Expense requests"
          subtitle="Money only leaves the pool with a public reason and committee approval."
          action={
            me && !open ? (
              <Button onClick={() => setOpen(true)}>+ New request</Button>
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
              <li key={e.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.reason}</p>
                  <p className="text-xs text-slate-400">
                    to {e.recipient_name} · {formatTime(e.timestamp)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold">{naira(e.amount)}</p>
                  <StatusBadge status={e.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SubmitExpense({ collectiveId, me, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    amount: "", reason: "", receipt_url: "", recipient_account: "", recipient_bank_code: "",
  });
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (k === "recipient_account" || k === "recipient_bank_code") lookup.reset();
  };

  const banks = useQuery({ queryKey: ["banks"], queryFn: api.getBanks, staleTime: Infinity });

  const lookup = useMutation({
    mutationFn: () => api.lookupAccount(form.recipient_account, form.recipient_bank_code),
  });

  const submit = useMutation({
    mutationFn: () =>
      api.submitExpense(collectiveId, {
        requested_by: me.id,
        amount: Number(form.amount),
        reason: form.reason,
        receipt_url: form.receipt_url || null,
        recipient_account: form.recipient_account,
        recipient_bank_code: form.recipient_bank_code,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", collectiveId] });
      setForm({ amount: "", reason: "", receipt_url: "", recipient_account: "", recipient_bank_code: "" });
      lookup.reset();
      onClose();
    },
  });

  const verified = lookup.isSuccess && lookup.data?.accountName;

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold">Request an expense</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount (₦)" type="number" min="1" step="0.01" value={form.amount} onChange={set("amount")} required />
          <Input label="Receipt / invoice URL (optional)" value={form.receipt_url} onChange={set("receipt_url")} />
        </div>
        <Input
          label="Reason — shown on the public ledger"
          placeholder="e.g. Generator fuel for July"
          value={form.reason}
          onChange={set("reason")}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Recipient bank" value={form.recipient_bank_code} onChange={set("recipient_bank_code")} required>
            <option value="">{banks.isLoading ? "Loading banks…" : "Select bank"}</option>
            {(banks.data || []).map((b) => (
              <option key={b.bankCode || b.code} value={b.bankCode || b.code}>
                {b.bankName || b.name}
              </option>
            ))}
          </Select>
          <Input
            label="Recipient account number"
            value={form.recipient_account}
            onChange={set("recipient_account")}
            maxLength={10}
            required
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={!form.recipient_account || !form.recipient_bank_code || lookup.isPending}
            onClick={() => lookup.mutate()}
          >
            {lookup.isPending ? "Verifying…" : "Verify account"}
          </Button>
          {verified && (
            <span className="text-sm font-medium text-emerald-700">
              ✓ {lookup.data.accountName}
            </span>
          )}
        </div>
        <ErrorNote error={lookup.error} />
        <ErrorNote error={submit.error} />

        <div className="flex gap-3">
          <Button type="submit" disabled={!verified || submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit for approval"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
        {!verified && (
          <p className="text-xs text-slate-400">Verify the recipient account before submitting.</p>
        )}
      </form>
    </Card>
  );
}
