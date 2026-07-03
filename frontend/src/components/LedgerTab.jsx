import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira, formatTime } from "../lib/format.js";
import { Card, Spinner, EmptyState, CopyButton } from "./ui.jsx";

const entryIcon = {
  contribution: ["🟢", "text-emerald-600"],
  expense: ["🔴", "text-red-600"],
  expense_failed: ["↩️", "text-blue-600"],
  expense_refunded: ["↩️", "text-blue-600"],
};

export default function LedgerTab({ collectiveId, collective }) {
  const ledger = useQuery({
    queryKey: ["ledger", collectiveId],
    queryFn: () => api.getLedger(collectiveId),
    refetchInterval: 10_000, // live: payments appear without a refresh
  });

  if (ledger.isLoading) return <Spinner />;
  const { balance, entries = [] } = ledger.data || {};

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-6">
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
        </Card>

        <Card className="bg-slate-900 p-6 text-white">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Pay dues to</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-widest">
            {collective.bank_account_number}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm text-slate-300">{collective.bank_name}</p>
            <CopyButton text={collective.bank_account_number} label="Copy number" />
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">Public ledger</h2>
          <p className="text-xs text-slate-400">
            Append-only. Every naira in and out, visible to every member.
          </p>
        </div>
        {entries.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            subtitle="The first transfer to the account above will appear here automatically."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => {
              const [icon, amountColor] = entryIcon[e.type] || ["⚪", "text-slate-600"];
              return (
                <li key={e.id} className="flex items-center gap-4 px-6 py-4">
                  <span className="text-lg">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.description}</p>
                    <p className="text-xs text-slate-400">
                      {e.actor_name} · {formatTime(e.timestamp)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${amountColor}`}>
                      {e.amount >= 0 ? "+" : ""}
                      {naira(e.amount)}
                    </p>
                    <p className="text-xs text-slate-400">bal {naira(e.balance_after)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
