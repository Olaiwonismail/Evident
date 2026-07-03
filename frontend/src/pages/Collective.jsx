import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { Badge, Spinner, CopyButton } from "../components/ui.jsx";
import LedgerTab from "../components/LedgerTab.jsx";
import DuesTab from "../components/DuesTab.jsx";
import ExpensesTab from "../components/ExpensesTab.jsx";
import ApprovalsTab from "../components/ApprovalsTab.jsx";
import MembersTab from "../components/MembersTab.jsx";

export default function Collective() {
  const { collectiveId } = useParams();
  const [params] = useSearchParams();
  const memberId = params.get("m");
  const [tab, setTab] = useState("ledger");

  const collective = useQuery({
    queryKey: ["collective", collectiveId],
    queryFn: () => api.getCollective(collectiveId),
  });
  const members = useQuery({
    queryKey: ["members", collectiveId],
    queryFn: () => api.getMembers(collectiveId),
  });

  const me = (members.data || []).find((m) => m.id === memberId) || null;
  const role = me?.role || "public";
  const isCommittee = role === "committee" || role === "organizer";
  const isOrganizer = role === "organizer";

  // surface the number of requests waiting on this approver right in the tab bar
  const expenses = useQuery({
    queryKey: ["expenses", collectiveId],
    queryFn: () => api.getExpenses(collectiveId),
    enabled: isCommittee,
    refetchInterval: 15_000,
  });
  const pendingCount = (expenses.data || []).filter((e) => e.status === "pending").length;

  if (collective.isLoading || members.isLoading) return <Spinner />;
  if (collective.isError)
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        Collective not found. <Link className="text-emerald-600 underline" to="/">Create one?</Link>
      </div>
    );

  const tabs = [
    { id: "ledger", label: "Ledger", show: true },
    { id: "dues", label: "My dues", show: !!me },
    { id: "expenses", label: "Expenses", show: true },
    { id: "approvals", label: "Approvals", show: isCommittee, count: pendingCount },
    { id: "members", label: "Members", show: true },
  ].filter((t) => t.show);

  const publicLink = `${window.location.origin}/c/${collectiveId}`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Link to="/" className="text-sm font-extrabold tracking-tight">
                evident<span className="text-emerald-600">.</span>
              </Link>
              <h1 className="mt-1 truncate text-xl font-bold tracking-tight sm:text-2xl">
                {collective.data.name}
              </h1>
              <p className="mt-0.5 truncate text-sm text-slate-500">{collective.data.purpose}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
              {me ? (
                <div className="text-right">
                  <p className="text-sm font-medium">{me.name}</p>
                  <Badge tone={isOrganizer ? "purple" : isCommittee ? "blue" : "slate"}>
                    {role}
                  </Badge>
                </div>
              ) : (
                <Badge tone="slate">public view</Badge>
              )}
              <CopyButton text={publicLink} label="Share ledger" />
            </div>
          </div>

          <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto pb-2" aria-label="Sections">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                        active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {tab === "ledger" && <LedgerTab collectiveId={collectiveId} collective={collective.data} />}
        {tab === "dues" && me && <DuesTab collectiveId={collectiveId} me={me} />}
        {tab === "expenses" && (
          <ExpensesTab collectiveId={collectiveId} me={me} />
        )}
        {tab === "approvals" && isCommittee && (
          <ApprovalsTab collectiveId={collectiveId} me={me} />
        )}
        {tab === "members" && (
          <MembersTab
            collectiveId={collectiveId}
            collective={collective.data}
            isOrganizer={isOrganizer}
          />
        )}
      </main>
    </div>
  );
}
