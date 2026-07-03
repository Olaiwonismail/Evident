import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api.js";
import { Card, Button, Input, Select, ErrorNote, CopyButton } from "../components/ui.jsx";

export default function Landing() {
  const [form, setForm] = useState({
    name: "",
    purpose: "",
    dues_amount: "",
    dues_frequency: "monthly",
    organizer_name: "",
    organizer_phone: "",
    organizer_email: "",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () =>
      api.createCollective({
        ...form,
        dues_amount: form.dues_amount ? Number(form.dues_amount) : null,
        organizer_email: form.organizer_email || null,
        organizer_phone: form.organizer_phone || null,
      }),
  });

  if (create.isSuccess) {
    const c = create.data;
    const publicLink = `${window.location.origin}/c/${c.id}`;
    const organizerLink = `${publicLink}?m=${c.organizer_id}`;
    return (
      <Shell>
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
              {c.bank_account_number}
            </p>
            <p className="mt-1 text-sm text-slate-300">{c.bank_name}</p>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Your organizer link</p>
                <p className="truncate text-xs text-slate-400">{organizerLink}</p>
              </div>
              <CopyButton text={organizerLink} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Public ledger link — share with everyone</p>
                <p className="truncate text-xs text-slate-400">{publicLink}</p>
              </div>
              <CopyButton text={publicLink} />
            </div>
          </div>

          <Link to={`/c/${c.id}?m=${c.organizer_id}`} className="mt-6 block">
            <Button className="w-full">Open your dashboard →</Button>
          </Link>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Every naira <span className="text-emerald-600">in the open.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
            Evident gives your association, co-op or alumni group a dedicated bank account with a
            live public ledger. No more “trust the treasurer” — trust the ledger.
          </p>
        </div>

        <Card className="p-8">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
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
            <Input
              label="Your name"
              value={form.organizer_name}
              onChange={set("organizer_name")}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Phone (optional)"
                hint="Used to match your own transfers to you"
                value={form.organizer_phone}
                onChange={set("organizer_phone")}
              />
              <Input
                label="Email (optional)"
                type="email"
                value={form.organizer_email}
                onChange={set("organizer_email")}
              />
            </div>

            <ErrorNote error={create.error} />
            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Creating your account…" : "Create collective"}
            </Button>
            <p className="text-center text-xs text-slate-400">
              A dedicated Nomba virtual account is provisioned instantly.
            </p>
          </form>
        </Card>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-lg font-extrabold tracking-tight">
            evident<span className="text-emerald-600">.</span>
          </span>
          <span className="text-xs text-slate-400">Nomba × DevCareer Hackathon 2026</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12">{children}</main>
    </div>
  );
}
