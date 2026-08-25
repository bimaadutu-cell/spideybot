"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRealtime } from "./RealtimeProvider";

export type ShellUser = { id: number; name: string; username: string; email: string | null; avatar: string | null };
type NavItem = { href: string; label: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: "⌂" }, { href: "/monitoring", label: "Monitoring", icon: "◉" }, { href: "/activity", label: "Activity", icon: "≋" }] },
  { label: "Bot control", items: [{ href: "/bots", label: "My Bots", icon: "◈" }, { href: "/bots/new", label: "Create Bot", icon: "+" }, { href: "/connection", label: "Connection", icon: "⌁" }, { href: "/commands", label: "Commands", icon: "⚡" }] },
  { label: "Automation", items: [{ href: "/downloader", label: "Downloader", icon: "↓" }, { href: "/groups", label: "Groups", icon: "◎" }, { href: "/terminal", label: "Terminal", icon: "▣" }] },
  { label: "Workspace", items: [{ href: "/files", label: "Files", icon: "□" }, { href: "/environment", label: "Environment", icon: "⌘" }, { href: "/backups", label: "Backups", icon: "◇" }, { href: "/notifications", label: "Notifications", icon: "•" }, { href: "/settings", label: "Settings", icon: "⚙" }] },
];

const ALL_NAV = NAV_GROUPS.flatMap((group) => group.items);
const BOTTOM: NavItem[] = [{ href: "/dashboard", label: "Home", icon: "⌂" }, { href: "/bots", label: "Bots", icon: "◈" }, { href: "/connection", label: "Connect", icon: "⌁" }, { href: "/commands", label: "Commands", icon: "⚡" }];
const MORE: NavItem[] = NAV_GROUPS.flatMap((group) => group.items).filter((item) => !BOTTOM.some((bottom) => bottom.href === item.href));

export default function Shell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { connected, notificationsTick } = useRealtime();
  const [moreOpen, setMoreOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications", { cache: "no-store" }).then((r) => r.json()).then((d: { unread?: number }) => { if (!cancelled) setUnread(d.unread ?? 0); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [notificationsTick, pathname]);
  useEffect(() => setMoreOpen(false), [pathname]);

  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };
  const active = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const currentLabel = ALL_NAV.find((item) => active(item.href))?.label ?? "SpideyBot";

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-cyan-300/10 bg-[#020817]/95 lg:flex">
        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-2xl shadow-[0_0_22px_rgba(34,211,238,.15)]">🕷️</span>
          <div><p className="text-sm font-black tracking-[0.2em] text-white">SPIDEYBOT</p><p className="text-[10px] text-cyan-100/50">CONTROL PLANE</p></div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {NAV_GROUPS.map((group) => <div key={group.label}><p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100/40">{group.label}</p><div className="space-y-1">{group.items.map((item) => <Link key={item.href} href={item.href} className={`btn w-full justify-start gap-3 ${active(item.href) ? "border-cyan-300/40 bg-cyan-300/10 text-white shadow-[0_0_18px_rgba(34,211,238,.08)]" : "border-transparent bg-transparent text-slate-400"}`}><span className="w-5 text-center text-cyan-200">{item.icon}</span><span>{item.label}</span>{item.href === "/notifications" && unread > 0 && <span className="ml-auto rounded-full bg-cyan-300 px-2 text-[10px] font-bold text-[#03142b]">{unread}</span>}</Link>)}</div></div>)}
        </nav>
        <div className="space-y-2 border-t border-white/5 p-3"><Link href="/profile" className="btn w-full justify-start border-transparent bg-transparent text-slate-300">◉ <span className="truncate">{user.name}</span></Link><button type="button" onClick={logout} className="btn btn-danger w-full justify-start">↪ Logout</button></div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-cyan-300/10 bg-[#020817]/85 backdrop-blur lg:pl-64"><div className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-3 lg:hidden"><span className="text-2xl">🕷️</span><span className="text-sm font-black tracking-[0.18em]">SPIDEYBOT</span></div><div className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/60 lg:block">{currentLabel}</div><div className="flex items-center gap-2"><span className={`chip ${connected ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-slate-600/50 bg-slate-600/10 text-slate-400"}`}><span className={`h-2 w-2 rounded-full ${connected ? "bg-cyan-300 live-dot" : "bg-slate-500"}`} />{connected ? "LIVE" : "OFFLINE"}</span><Link href="/notifications" className="btn relative px-3 py-2 text-cyan-100">•{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-cyan-300 px-1.5 text-[10px] font-bold text-[#03142b]">{unread}</span>}</Link><Link href="/profile" className="btn px-2 py-1.5">{user.avatar ? <img src={user.avatar} alt="" className="h-6 w-6 rounded-full" /> : <span>◉</span>}<span className="hidden max-w-[8rem] truncate text-xs sm:inline">{user.name}</span></Link></div></div></header>
      <main className="px-3 pb-28 pt-4 sm:px-5 lg:pb-10 lg:pl-[17.5rem] lg:pr-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-300/15 bg-[#020817]/98 backdrop-blur lg:hidden"><div className="grid grid-cols-5">{BOTTOM.map((item) => <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold ${active(item.href) ? "text-cyan-200" : "text-slate-400"}`}><span className="text-lg">{item.icon}</span>{item.label}</Link>)}<button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold text-slate-400"><span className="text-lg">⋯</span>More</button></div></nav>
      {moreOpen && <div className="fixed inset-0 z-50 flex items-end bg-[#000814]/80 lg:hidden" onClick={() => setMoreOpen(false)}><div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl border-t border-cyan-300/20 bg-[#061329] p-4" onClick={(event) => event.stopPropagation()}><div className="mx-auto mb-3 h-1 w-10 rounded-full bg-cyan-200/30" /><p className="mb-3 px-1 text-xs font-bold uppercase tracking-[0.2em] text-cyan-100/50">More workspace tools</p><div className="grid grid-cols-3 gap-2">{MORE.map((item) => <Link key={item.href} href={item.href} className="btn flex-col py-3 text-[11px]"><span className="text-xl text-cyan-200">{item.icon}</span>{item.label}</Link>)}<Link href="/profile" className="btn flex-col py-3 text-[11px]"><span className="text-xl">◉</span>Profile</Link><button type="button" onClick={logout} className="btn btn-danger flex-col py-3 text-[11px]"><span className="text-xl">↪</span>Logout</button></div><button type="button" onClick={() => setMoreOpen(false)} className="btn mt-3 w-full">Close</button></div></div>}
    </div>
  );
}
