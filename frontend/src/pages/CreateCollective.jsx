import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api.js";
import { setSessionMember } from "../lib/session.js";
import { groupDigits } from "../lib/format.js";
import { Card, Button, Input, Select, ErrorNote, CopyButton } from "../components/ui.jsx";
import PublicShell from "../components/PublicShell.jsx";

// Three steps: group details → light identity check on the organizer →
// account number reveal. Finishing step 2 is what provisions the Nomba
// virtual account behind the scenes.
export default function CreateCollective() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    purpose: "",
    dues_amount: "",
    dues_frequency: "monthly",
    organizer_name: "",
    organizer_phone: "",
    organizer_email: "",
    id_number: "",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const identity = useMutation({
    mutationFn: () => api.verifyIdentity({ id_number: form.id_number }),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createCollective({
        ...form,
        dues_amount: form.dues_amount ? Number(form.dues_amount) : null,
        organizer_email: form.organizer_email || null,
        organizer_phone: form.organizer_phone || null,
      }),
    onSuccess: (c) => setSessionMember(c.id, c.organizer_id),
  });

  if (create.isSuccess) {
    const c = create.data;
    const publicLink = `${window.location.origin}/c/${c.id}`;
    return (
      <PublicShell>
        <Card className="mx-auto max-w-xl p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              🎉
            </div>
            <h2 className="text-xl font-bold">{c.name} is live</h2>
            <p className="mt-1 text-sm text-slate-500">
              Members pay dues straight into this dedicated account — every transfer lands on the
              public ledger automatically.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900 p-6 text-center text-white">
            <p className="text-xs uppercase tracking-wider text-slate-400">Pay dues to</p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-widest">
              {groupDigits(c.bank_account_number)}
            </p>
            <div className="mt-3 flex justify-center">
              <CopyButton text={c.bank_account_number} label="Copy number" />
            </div>
            <p className="mt-1 text-sm text-slate-300">{c.bank_name}</p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Public ledger link — share with everyone</p>
              <p className="truncate text-xs text-slate-400">{publicLink}</p>
            </div>
            <CopyButton text={publicLink} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button onClick={() => navigate(`/c/${c.id}/members`)}>Invite members →</Button>
            <Button variant="secondary" onClick={() => navigate(`/c/${c.id}`)}>
              Open dashboard
            </Button>
          </div>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="mx-auto max-w-xl">
        <StepTracker step={step} />

        {step === 1 && (
          <Card className="p-8">
            <h1 className="mb-1 text-lg font-bold">Set up your collective</h1>
            <p className="mb-6 text-sm text-slate-500">
              Name the group, state its purpose, and set the dues. This is what members will see.
            </p>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setStep(2);
              }}
            >
              <Input
                label="Collective name"
                placeholder="e.g. Ikeja GRA Estate Levy Fund"
                value={form.name}
                onChange={set("name")}
                required
              />
              <Input
                label="Purpose"
                placeholder="What is this group raising money for?"
                value={form.purpose}
                onChange={set("purpose")}
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Dues amount (₦, optional)"
                  type="number"
                  min="0"
                  placeholder="5000"
                  value={form.dues_amount}
                  onChange={set("dues_amount")}
                />
                <Select label="Frequency" value={form.dues_frequency} onChange={set("dues_frequency")}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </Select>
              </div>

              <hr className="border-slate-100" />
              <p className="text-sm font-semibold text-slate-700">You (the organizer)</p>
              <Input label="Your name" value={form.organizer_name} onChange={set("organizer_name")} required />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Phone"
                  hint="Used to match your own transfers to you"
                  value={form.organizer_phone}
                  onChange={set("organizer_phone")}
                  required
                />
                <Input
                  label="Email (optional)"
                  type="email"
                  value={form.organizer_email}
                  onChange={set("organizer_email")}
                />
              </div>
              <Button type="submit" className="w-full">
                Continue to identity check →
              </Button>
            </form>
          </Card>
        )}

        {step === 2 && (
          <Card className="p-8">
            <h1 className="mb-1 text-lg font-bold">Verify your identity</h1>
            <p className="mb-6 text-sm text-slate-500">
              A light check on you as the organizer — the collective's bank account inherits
              verification underneath, so this stays quick.
            </p>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (identity.isSuccess) create.mutate();
                else identity.mutate();
              }}
            >
              <Input
                label="BVN or NIN"
                inputMode="numeric"
                maxLength={11}
                placeholder="11 digits"
                value={form.id_number}
                onChange={(e) => {
                  setForm({ ...form, id_number: e.target.value.replace(/\D/g, "") });
                  identity.reset();
                }}
                hint="Only used to confirm you are who you say — never shown to members."
                required
              />
              {!identity.isSuccess && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  MVP: verification is instant — any 11 digits pass. Manual review backs it up in
                  production.
                </p>
              )}
              {identity.isSuccess && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  ✓ Identity verified — you're good to go.
                </p>
              )}
              <ErrorNote error={identity.error || create.error} />
              <Button
                type="submit"
                className="w-full"
                disabled={identity.isPending || create.isPending || form.id_number.length !== 11}
              >
                {identity.isPending
                  ? "Verifying…"
                  : create.isPending
                    ? "Creating your account…"
                    : identity.isSuccess
                      ? "Create collective"
                      : "Verify identity"}
              </Button>
              {!identity.isSuccess && (
                <button
                  type="button"
                  onClick={() => create.mutate()}
                  disabled={create.isPending}
                  className="w-full text-center text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                >
                  Can't verify right now? Continue — we'll review manually.
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
              >
                ← Back to details
              </button>
            </form>
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Already in a collective?{" "}
          <Link to="/login" className="font-medium text-emerald-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}

function StepTracker({ step }) {
  const steps = ["Group details", "Identity check", "Account ready"];
  return (
    <ol className="mb-6 flex items-center justify-center gap-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                state === "done"
                  ? "bg-emerald-600 text-white"
                  : state === "active"
                    ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-600"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span
              className={`text-xs font-medium ${
                state === "active" ? "text-slate-800" : "text-slate-400"
              }`}
            >
              {label}
            </span>
            {n < steps.length && <span className="h-px w-6 bg-slate-200" />}
          </li>
        );
      })}
    </ol>
  );
}
