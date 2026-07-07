import { Link, useParams } from "react-router-dom";
import { naira, formatTime } from "../lib/format.js";
import { EmptyState, StatusBadge } from "./ui.jsx";

const entryIcon = {
  contribution: ["🟢", "text-emerald-600"],
  expense: ["🔴", "text-red-600"],
  expense_failed: ["↩️", "text-blue-600"],
  expense_refunded: ["↩️", "text-blue-600"],
  expense_rejected: ["🚫", "text-slate-500"],
};

// One ledger row. Rejected requests carry no money — they show a status badge
// instead of a figure, but they stay on the record.
function Row({ entry }) {
  const { collectiveId } = useParams();
  const [icon, amountColor] = entryIcon[entry.type] || ["⚪", "text-slate-600"];
  const body = (
    <>
      <span className="text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.description}</p>
        <p className="truncate text-xs text-slate-400">
          {entry.actor_name} · {formatTime(entry.timestamp)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {entry.type === "expense_rejected" ? (
          <StatusBadge status="rejected" />
        ) : (
          <>
            <p className={`text-sm font-bold tabular-nums ${amountColor}`}>
              {entry.amount >= 0 ? "+" : ""}
              {naira(entry.amount)}
            </p>
            <p className="text-xs tabular-nums text-slate-400">
              bal {naira(entry.balance_after)}
            </p>
          </>
        )}
      </div>
    </>
  );

  if (entry.expense_id) {
    return (
      <Link
        to={`/c/${collectiveId}/expenses/${entry.expense_id}`}
        className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex items-center gap-4 px-6 py-4">{body}</div>;
}

export default function LedgerList({ entries, limit }) {
  if (!entries.length) {
    return (
      <EmptyState
        icon="📖"
        title="No transactions yet"
        subtitle="The first transfer to the collective's account will appear here automatically."
      />
    );
  }
  const shown = limit ? entries.slice(0, limit) : entries;
  return (
    <ul className="divide-y divide-slate-100">
      {shown.map((e) => (
        <li key={e.id}>
          <Row entry={e} />
        </li>
      ))}
    </ul>
  );
}
