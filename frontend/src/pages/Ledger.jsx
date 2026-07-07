import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { Card, CardHeader, Spinner } from "../components/ui.jsx";
import LedgerList from "../components/LedgerList.jsx";
import MoneyFlow from "../components/MoneyFlow.jsx";

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "in", label: "Money in" },
  { id: "out", label: "Money out" },
  { id: "flagged", label: "Rejected & failed" },
];

const matches = {
  all: () => true,
  in: (e) => e.type === "contribution" || e.type === "expense_refunded" || e.type === "expense_failed",
  out: (e) => e.type === "expense",
  flagged: (e) =>
    e.type === "expense_rejected" || e.type === "expense_refunded" || e.type === "expense_failed",
};

// The permanent record. Append-only — rejected and failed items stay visible
// alongside the wins, because that's the honesty claim.
export default function Ledger() {
  const { collectiveId, members } = useOutletContext();
  const [filter, setFilter] = useState("all");

  const ledger = useQuery({
    queryKey: ["ledger", collectiveId],
    queryFn: () => api.getLedger(collectiveId),
    refetchInterval: 10_000,
  });

  if (ledger.isLoading) return <Spinner />;
  const { balance, entries = [] } = ledger.data || {};
  const shown = entries.filter(matches[filter]);

  return (
    <div className="space-y-6">
      <MoneyFlow entries={entries} memberCount={members.length} balance={balance} />

      <Card>
        <CardHeader
          title="Public ledger"
          subtitle="Append-only. Every naira in and out — including rejected and failed items — visible to every member, forever."
          action={
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === f.id
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        />
        <LedgerList entries={shown} />
      </Card>
    </div>
  );
}
