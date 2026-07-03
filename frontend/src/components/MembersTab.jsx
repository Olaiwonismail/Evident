import { useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira } from "../lib/format.js";
import { Card, Button, Input, Select, Spinner, EmptyState, Badge, ErrorNote, CopyButton } from "./ui.jsx";

const roleTone = { organizer: "purple", committee: "blue", member: "slate" };

export default function MembersTab({ collectiveId, collective, isOrganizer }) {
  const members = useQuery({
    queryKey: ["members", collectiveId],
    queryFn: () => api.getMembers(collectiveId),
  });

  const contributionQueries = useQueries({
    queries: (members.data || []).map((m) => ({
      queryKey: ["contributions", collectiveId, m.id],
      queryFn: () => api.getContributions(collectiveId, m.id),
      staleTime: 15_000,
    })),
  });

  if (members.isLoading) return <Spinner />;
  const dues = collective.dues_amount;

  return (
    <div className="space-y-6">
      {isOrganizer && <InviteMember collectiveId={collectiveId} />}

      <Card>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">Members ({(members.data || []).length})</h2>
          {dues ? (
            <p className="text-xs text-slate-400">
              Dues: {naira(dues)} {collective.dues_frequency}
            </p>
          ) : null}
        </div>
        {(members.data || []).length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.data.map((m, i) => {
              const paid = contributionQueries[i]?.data?.total_paid ?? null;
              const owes = dues && paid !== null ? Math.max(0, dues - paid) : null;
              return (
                <li key={m.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.phone || m.email || "no contact"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {paid !== null && (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-emerald-600">{naira(paid)} paid</p>
                        {owes > 0 && (
                          <p className="text-xs font-medium text-amber-600">owes {naira(owes)}</p>
                        )}
                        {dues && owes === 0 && (
                          <p className="text-xs font-medium text-emerald-600">up to date ✓</p>
                        )}
                      </div>
                    )}
                    <Badge tone={roleTone[m.role] || "slate"}>{m.role}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function InviteMember({ collectiveId }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", role: "member" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const invite = useMutation({
    mutationFn: () =>
      api.inviteMember(collectiveId, {
        ...form,
        phone: form.phone || null,
        email: form.email || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members", collectiveId] }),
  });

  if (!open) return <Button onClick={() => setOpen(true)}>+ Invite a member</Button>;

  if (invite.isSuccess) {
    const link = `${window.location.origin}/c/${collectiveId}?m=${invite.data.id}`;
    return (
      <Card className="p-6">
        <p className="text-sm font-semibold">
          {invite.data.name} added as {invite.data.role} 🎉
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Send them this personal link — opening it is how they access the collective as themselves.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <p className="truncate text-xs text-slate-500">{link}</p>
          <CopyButton text={link} />
        </div>
        <div className="mt-4 flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              invite.reset();
              setForm({ name: "", phone: "", email: "", role: "member" });
            }}
          >
            Invite another
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold">Invite a member</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={set("name")} required />
          <Select label="Role" value={form.role} onChange={set("role")}>
            <option value="member">Member</option>
            <option value="committee">Committee (can approve expenses)</option>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phone"
            hint="Match transfers from bank accounts registered to this number"
            value={form.phone}
            onChange={set("phone")}
          />
          <Input label="Email (optional)" type="email" value={form.email} onChange={set("email")} />
        </div>
        <ErrorNote error={invite.error} />
        <div className="flex gap-3">
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Adding…" : "Add member"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
