import { naira } from "../lib/format.js";

// A glanceable picture of the glass box: dues flow in from members, sit in
// one visible pool, and only leave to verified recipients via approvals.
// Numbers are computed from the ledger itself, so the diagram can't lie.
export default function MoneyFlow({ entries, memberCount, balance }) {
  const totalIn = entries
    .filter((e) => e.type === "contribution")
    .reduce((s, e) => s + (e.amount || 0), 0);
  const payouts = entries.filter((e) => e.type === "expense");
  const totalOut = payouts.reduce((s, e) => s - (e.amount || 0), 0);
  const refunded = entries
    .filter((e) => e.type === "expense_refunded" || e.type === "expense_failed")
    .reduce((s, e) => s + (e.amount || 0), 0);
  const netOut = totalOut - refunded;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <FlowNode
          icon="👥"
          title="Members"
          big={`${memberCount}`}
          sub="pay dues from any bank"
        />
        <FlowArrow amount={totalIn} label="dues in" tone="text-emerald-600" />
        <FlowNode
          icon="🏦"
          title="Collective pool"
          big={naira(balance ?? 0)}
          sub="held in the open — everyone sees this number"
          highlight
        />
        <FlowArrow amount={netOut} label="approved payouts" tone="text-red-600" />
        <FlowNode
          icon="✅"
          title="Verified recipients"
          big={`${payouts.length} payout${payouts.length === 1 ? "" : "s"}`}
          sub="each with a public reason & approver's name"
        />
      </div>
      {refunded > 0 && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
          ↩️ {naira(refunded)} came back after a failed transfer — money never disappears quietly.
        </p>
      )}
    </div>
  );
}

function FlowNode({ icon, title, big, sub, highlight }) {
  return (
    <div
      className={`flex-1 rounded-2xl p-4 text-center ${
        highlight ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-xl">{icon}</p>
      <p
        className={`mt-1 text-xs font-medium uppercase tracking-wider ${
          highlight ? "text-slate-400" : "text-slate-400"
        }`}
      >
        {title}
      </p>
      <p className="mt-0.5 text-lg font-extrabold tracking-tight">{big}</p>
      <p className={`mt-0.5 text-[11px] ${highlight ? "text-slate-300" : "text-slate-400"}`}>
        {sub}
      </p>
    </div>
  );
}

function FlowArrow({ amount, label, tone }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1 py-1 sm:px-2">
      <p className={`text-sm font-bold tabular-nums ${tone}`}>{naira(amount)}</p>
      {/* down on mobile (stacked), right on desktop (side by side) */}
      <span className="text-xl leading-none text-slate-300 sm:hidden">↓</span>
      <span className="hidden text-xl leading-none text-slate-300 sm:block">⟶</span>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}
