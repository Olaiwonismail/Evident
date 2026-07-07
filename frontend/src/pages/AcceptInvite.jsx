import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { setSessionMember } from "../lib/session.js";
import { naira } from "../lib/format.js";
import { Card, Button, Badge, Spinner } from "../components/ui.jsx";
import PublicShell from "../components/PublicShell.jsx";

// Where an invited member lands from their invitation: see the collective
// they've been asked to join, then confirm and step inside as themselves.
export default function AcceptInvite() {
  const { collectiveId, memberId } = useParams();
  const navigate = useNavigate();

  const collective = useQuery({
    queryKey: ["collective", collectiveId],
    queryFn: () => api.getCollective(collectiveId),
  });
  const members = useQuery({
    queryKey: ["members", collectiveId],
    queryFn: () => api.getMembers(collectiveId),
  });

  if (collective.isLoading || members.isLoading)
    return (
      <PublicShell>
        <Spinner />
      </PublicShell>
    );

  const me = (members.data || []).find((m) => m.id === memberId);
  if (collective.isError || !me)
    return (
      <PublicShell>
        <div className="py-20 text-center text-sm text-slate-500">
          This invite link isn't valid — ask your organizer to send a fresh one.
          <p className="mt-2">
            <Link className="text-emerald-600 underline" to="/">
              Back home
            </Link>
          </p>
        </div>
      </PublicShell>
    );

  const c = collective.data;

  return (
    <PublicShell>
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
          ✉️
        </div>
        <h1 className="text-xl font-bold">You're invited, {me.name.split(" ")[0]}</h1>
        <p className="mt-2 text-sm text-slate-500">
          You've been asked to join this collective as{" "}
          <Badge tone={me.role === "committee" ? "blue" : "slate"}>{me.role}</Badge>
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left">
          <p className="font-semibold">{c.name}</p>
          <p className="mt-0.5 text-sm text-slate-500">{c.purpose}</p>
          <dl className="mt-4 space-y-1.5 border-t border-slate-200 pt-3 text-sm">
            {c.dues_amount && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Dues</dt>
                <dd className="font-medium">
                  {naira(c.dues_amount)} {c.dues_frequency}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-400">Members</dt>
              <dd className="font-medium">{(members.data || []).length}</dd>
            </div>
          </dl>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Everything this group does with money — every payment in, every payout — is on a public
          ledger you'll be able to see.
        </p>

        <Button
          className="mt-6 w-full"
          onClick={() => {
            setSessionMember(collectiveId, memberId);
            navigate(`/c/${collectiveId}`);
          }}
        >
          Accept & join {c.name.split(" ")[0]} →
        </Button>
        <Link
          to={`/c/${collectiveId}`}
          className="mt-3 block text-xs text-slate-400 hover:text-slate-600"
        >
          Just look around first (public view)
        </Link>
      </Card>
    </PublicShell>
  );
}
