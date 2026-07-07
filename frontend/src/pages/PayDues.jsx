import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isDemoCollective } from "../api.js";
import { naira, groupDigits } from "../lib/format.js";
import { Card, Button, CopyButton, EmptyState } from "../components/ui.jsx";

// Turns intent into an actual payment: show exactly where to send money and
// how much, then confirm the moment it lands so the member never wonders
// whether it went through.
export default function PayDues() {
  const { collectiveId, collective, me } = useOutletContext();
  const queryClient = useQueryClient();
  // idle → waiting (member says they've sent it) → confirmed (money landed)
  const [phase, setPhase] = useState("idle");
  const [baseline, setBaseline] = useState(null); // contribution ids seen before the transfer
  const [received, setReceived] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  // while waiting, poll the member's contributions — the Nomba webhook writes
  // the new one server-side (the demo store fakes the same thing)
  const contribs = useQuery({
    queryKey: ["contributions", collectiveId, me?.id],
    queryFn: () => api.getContributions(collectiveId, me.id),
    enabled: !!me && phase === "waiting",
    refetchInterval: phase === "waiting" ? 4000 : false,
  });

  useEffect(() => {
    if (phase !== "waiting" || !baseline || !contribs.data) return;
    const fresh = (contribs.data.contributions || []).find((c) => !baseline.has(c.id));
    if (fresh) {
      setReceived(fresh);
      setPhase("confirmed");
      queryClient.invalidateQueries({ queryKey: ["ledger", collectiveId] });
    }
  }, [phase, baseline, contribs.data, queryClient, collectiveId]);

  if (!me) {
    return (
      <Card>
        <EmptyState
          icon="🔑"
          title="Open your personal link to pay dues"
          subtitle="We need to know who you are so your transfer is credited to your record."
        />
      </Card>
    );
  }

  const dues = collective.dues_amount;

  const startWaiting = async () => {
    const current = await api.getContributions(collectiveId, me.id);
    setBaseline(new Set((current.contributions || []).map((c) => c.id)));
    setPhase("waiting");
    if (isDemoCollective(collectiveId)) {
      // demo: stand in for the real bank transfer landing via webhook
      timer.current = setTimeout(async () => {
        await api.simulateIncomingTransfer(collectiveId, me.id, dues || 5000);
        queryClient.invalidateQueries({ queryKey: ["contributions", collectiveId, me.id] });
      }, 2800);
    }
  };

  if (phase === "confirmed") {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
          ✅
        </div>
        <h1 className="text-xl font-bold">{naira(received.amount)} received</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your payment landed and is already on the public ledger — logged permanently under your
          name, {me.name}.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link to={`/c/${collectiveId}/ledger`}>
            <Button variant="secondary" className="w-full">See it on the ledger</Button>
          </Link>
          <Link to={`/c/${collectiveId}/me`}>
            <Button className="w-full">My record →</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="p-8">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-bold">Pay your dues</h1>
          <p className="mt-1 text-sm text-slate-500">
            Transfer from any Nigerian bank app. Send from the account registered to your phone
            number ({me.phone || "your registered number"}) so it's matched to you automatically.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6 text-center text-white">
          <p className="text-xs uppercase tracking-wider text-slate-400">Amount expected</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">
            {dues ? naira(dues) : "Any amount"}
          </p>
          {collective.dues_frequency && dues && (
            <p className="mt-0.5 text-xs text-slate-400">{collective.dues_frequency} dues</p>
          )}
          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">Transfer to</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-widest">
              {groupDigits(collective.bank_account_number)}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {collective.bank_name} · {collective.name}
            </p>
            <div className="mt-3 flex justify-center">
              <CopyButton text={collective.bank_account_number} label="Copy account number" />
            </div>
          </div>
        </div>

        {phase === "idle" ? (
          <Button className="mt-6 w-full" onClick={startWaiting}>
            I've made the transfer
          </Button>
        ) : (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
            <p className="text-sm font-medium text-emerald-800">Watching for your transfer…</p>
            <p className="mt-1 text-xs text-emerald-700/70">
              You'll get a confirmation here the moment it lands. Safe to close — it will still be
              logged.
            </p>
          </div>
        )}
      </Card>

      {isDemoCollective(collectiveId) && phase === "waiting" && (
        <p className="text-center text-xs text-amber-600">
          Demo: a simulated transfer will land in a few seconds.
        </p>
      )}
    </div>
  );
}
