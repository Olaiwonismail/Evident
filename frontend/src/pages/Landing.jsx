import { Link } from "react-router-dom";
import { DEMO_ID } from "../api.js";
import { Button } from "../components/ui.jsx";
import PublicShell from "../components/PublicShell.jsx";

export default function Landing() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">
          Every naira <span className="text-emerald-600">in the open.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-slate-500">
          Evident gives your association, co-op or alumni group a dedicated bank account with a
          live public ledger. No more "trust the treasurer" — trust the ledger.
        </p>

        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
          <Link to="/create">
            <Button className="w-full">Create a collective</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" className="w-full">
              Log in
            </Button>
          </Link>
          <Link
            to={`/c/${DEMO_ID}?m=m1`}
            className="text-sm font-medium text-emerald-600 hover:underline"
          >
            Or explore the live demo collective →
          </Link>
        </div>

        <div className="mx-auto mt-12 grid max-w-lg grid-cols-3 gap-3 text-center">
          {[
            ["🏦", "Dedicated account", "One NUBAN per group"],
            ["📖", "Live public ledger", "Every transfer visible"],
            ["🤝", "Committee approvals", "No solo spending"],
          ].map(([icon, title, sub]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-lg">{icon}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">{title}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            How it works
          </p>
          <ol className="mt-3 space-y-2.5 text-sm text-slate-600">
            {[
              "Create your collective — a dedicated Nomba account is provisioned instantly.",
              "Members transfer dues from any Nigerian bank; each payment lands on the public ledger automatically.",
              "Spending needs a public reason and a committee approval — then the payout goes straight to the verified recipient.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </PublicShell>
  );
}
