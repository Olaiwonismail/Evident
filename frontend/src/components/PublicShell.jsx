import { Link } from "react-router-dom";

// Layout for pages outside a collective: landing, auth, create, accept-invite.
export default function PublicShell({ children }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-extrabold tracking-tight">
            evident<span className="text-emerald-600">.</span>
          </Link>
          <span className="text-xs text-slate-400">Nomba × DevCareer Hackathon 2026</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12">{children}</main>
    </div>
  );
}
