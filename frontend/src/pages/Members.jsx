import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { naira } from "../lib/format.js";
import {
  Card, CardHeader, Button, Input, Select, EmptyState, Badge, ErrorNote, CopyButton,
} from "../components/ui.jsx";

const roleTone = { organizer: "purple", committee: "blue", member: "slate" };

// Who's in, who holds committee power, and (for the organizer) the levers to
// change that: invites and committee assignment.
export default function Members() {
  const { collectiveId, collective, members, isOrganizer } = useOutletContext();
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);

  const contributionQueries = useQueries({
    queries: members.map((m) => ({
      queryKey: ["contributions", collectiveId, m.id],
      queryFn: () => api.getContributions(collectiveId, m.id),
      staleTime: 15_000,
    })),
  });

  const setRole = useMutation({
    mutationFn: ({ memberId, role }) => api.setMemberRole(collectiveId, memberId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members", collectiveId] }),
  });

  const dues = collective.dues_amount;
  const committee = members.filter((m) => m.role === "committee" || m.role === "organizer");

  return (
    <div className="space-y-6">
      {isOrganizer && inviting && (
        <InviteMember collectiveId={collectiveId} onClose={() => setInviting(false)} />
      )}

      <Card>
        <CardHeader
          title={`Members (${members.length})`}
          subtitle={
            `${committee.length} can approve expenses` +
            (dues ? ` · dues ${naira(dues)} ${collective.dues_frequency}` : "")
          }
          action={
            isOrganizer && !inviting ? (
              <Button onClick={() => setInviting(true)}>+ Invite</Button>
            ) : null
          }
        />
        {members.length === 0 ? (
          <EmptyState icon="👥" title="No members yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m, i) => {
              const paid = contributionQueries[i]?.data?.total_paid ?? null;
              const owes = dues && paid !== null ? Math.max(0, dues - paid) : null;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.phone || m.email || "no contact"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
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
                    {isOrganizer && m.role !== "organizer" && (
                      <Button
                        variant="secondary"
                        className="!px-3 !py-1.5 !text-xs"
                        disabled={setRole.isPending}
                        onClick={() =>
                          setRole.mutate({
                            memberId: m.id,
                            role: m.role === "committee" ? "member" : "committee",
                          })
                        }
                      >
                        {m.role === "committee" ? "Remove from committee" : "Make committee"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="px-6 pb-4">
          <ErrorNote error={setRole.error} />
        </div>
      </Card>

      {isOrganizer && (
        <p className="px-2 text-xs text-slate-400">
          Committee members can approve or reject expenses — every decision carries their name on
          the public ledger. Assign at least one person besides yourself.
        </p>
      )}
    </div>
  );
}

function InviteMember({ collectiveId, onClose }) {
  const queryClient = useQueryClient();
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

  if (invite.isSuccess) {
    const link = `${window.location.origin}/join/${collectiveId}/${invite.data.id}`;
    return (
      <Card className="p-6">
        <p className="text-sm font-semibold">
          {invite.data.name} invited as {invite.data.role} 🎉
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Send them this invite link — opening it shows them the collective and lets them accept
          and set up their account.
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
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
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
            {invite.isPending ? "Sending invite…" : "Send invite"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
