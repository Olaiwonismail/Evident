import { useState } from "react";

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeTones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  purple: "bg-purple-50 text-purple-700 ring-purple-600/20",
};

export function Badge({ tone = "slate", children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export const statusBadge = {
  exact: ["green", "paid in full"],
  partial: ["amber", "partial"],
  excess: ["blue", "overpaid — credited"],
  unmatched: ["purple", "needs review"],
  pending: ["amber", "pending approval"],
  disbursing: ["blue", "disbursing…"],
  paid: ["green", "paid"],
  failed: ["red", "failed"],
  rejected: ["slate", "rejected"],
  manual_review: ["purple", "manual review"],
};

export function StatusBadge({ status }) {
  const [tone, label] = statusBadge[status] || ["slate", status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary:
      "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
    secondary:
      "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  };
  return (
    <button
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-1 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, hint, ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <input
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
      <select
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
    </div>
  );
}

export function EmptyState({ title, subtitle, icon = "🗒️" }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-lg">
        {icon}
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {subtitle && <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">{subtitle}</p>}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{String(error.message || error)}</p>
  );
}

export function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : label}
    </Button>
  );
}
