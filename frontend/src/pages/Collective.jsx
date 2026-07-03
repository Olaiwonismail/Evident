import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { Badge, Spinner } from "../components/ui.jsx";
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

  if (collective.isLoading || members.isLoading) return <Spinner />;
  if (collective.isError)
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        Collective not found. <Link className="text-emerald-600 underline" to="/">Create one?</Link>
      </div>
    );

  const me = (members.data || []).find((m) => m.id === memberId) || null;
  const role = me?.role || "public";
  const isCommittee = role === "committee" || role === "organizer";
  const isOrganizer = role === "organizer";

  const tabs = [
    { id: "ledger", label: "Ledger", show: true },
    { id: "dues", label: "My dues", show: !!me },
    { id: "expenses", label: "Expenses", show: true },
    { id: "approvals", label: "Approvals", show: isCommittee },
    { id: "members", label: "Members", show: true },
  ].filter((t) => t.show);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link to="/" className="text-sm font-extrabold tracking-tight">
                evident<span className="text-emerald-600">.</span>
              </Link>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{collective.data.name}</h1>
              <p className="mt-0.5 text-sm text-slate-500">{collective.data.purpose}</p>
            </div>
            <div className="pt-1 text-right">
              {me ? (
                <>
                  <p className="text-sm font-medium">{me.name}</p>
                  <Badge tone={isOrganizer ? "purple" : isCommittee ? "blue" : "slate"}>
                    {role}
                  </Badge>
                </>
              ) : (
                <Badge tone="slate">public view</Badge>
              )}
            </div>
          </div>

          <nav className="mt-4 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "border-b-2 border-emerald-600 text-emerald-700"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </button>
            ))}
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
