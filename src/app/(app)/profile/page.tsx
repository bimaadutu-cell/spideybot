"use client";

import { useRouter } from "next/navigation";
import { Panel, useApi, timeAgo } from "@/components/ui";

type Me = { user: { id: number; name: string; username: string; email: string | null; avatar: string | null; role: string; createdAt: string; lastLoginAt: string | null } | null; accounts: { provider: string; username: string | null; createdAt: string }[] };

export default function ProfilePage() {
  const { data } = useApi<Me>("/api/auth/me");
  const router = useRouter();
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };
  const user = data?.user;

  return (
    <div className="space-y-4">
      <Panel title="Profile" subtitle="Operator identity for this SpideyBot workspace">
        <div className="flex flex-wrap items-center gap-4">
          {user?.avatar ? <img src={user.avatar} alt="" className="h-16 w-16 rounded-full border border-cyan-300/30" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-2xl text-cyan-100">◉</div>}
          <div className="min-w-0"><p className="text-lg font-bold text-white">{user?.name}</p><p className="text-xs text-cyan-100/60">@{user?.username}</p><p className="text-xs text-slate-500">{user?.email ?? "Local math access"}</p></div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400"><dt className="text-slate-600">Role</dt><dd className="text-right">{user?.role}</dd><dt className="text-slate-600">Member since</dt><dd className="text-right">{user ? new Date(user.createdAt).toLocaleDateString() : "-"}</dd><dt className="text-slate-600">Last login</dt><dd className="text-right">{timeAgo(user?.lastLoginAt)}</dd></dl>
      </Panel>

      <Panel title="Access method" subtitle="Session is issued after a one-time random math challenge">
        <div className="flex items-center gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/15 font-mono text-lg text-cyan-100">∑</span><div><p className="text-sm font-semibold text-white">Math challenge access</p><p className="mt-1 text-xs text-slate-400">No external provider account or hardcoded demo credential is attached.</p></div></div>
      </Panel>

      <Panel title="Session"><button type="button" className="btn btn-danger w-full" onClick={logout}>↪ LOGOUT</button></Panel>
    </div>
  );
}
