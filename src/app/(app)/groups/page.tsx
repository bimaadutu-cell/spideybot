"use client";

import { useEffect, useState } from "react";
import { Panel, Empty, useApi, apiSend } from "@/components/ui";

type GroupSettings = {
  antilink: boolean;
  antidelete: boolean;
  antitag: boolean;
  welcome: boolean;
  welcomeText: string | null;
  warningEnabled: boolean;
  warnLimit: number;
  muted: boolean;
};

type Group = {
  id: number;
  jid: string;
  subject: string | null;
  participantCount: number;
  isAdmin: boolean;
  warnings: number;
  settings: GroupSettings | null;
};

export default function GroupsPage() {
  const [botId, setBotId] = useState("");
  const { data, reload, loading } = useApi<{ bots: { id: string; name: string }[]; groups: Group[]; connected?: boolean }>(
    `/api/groups${botId ? `?botId=${botId}` : ""}`,
    [botId],
  );
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!botId && data?.bots.length) setBotId(data.bots[0].id);
  }, [data, botId]);

  const sync = async () => {
    setBusy("sync");
    setError(null);
    try {
      const res = await fetch(`/api/groups?botId=${botId}&sync=1`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? "sync failed");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (jid: string, key: keyof GroupSettings, value: boolean) => {
    setBusy(`${jid}:${key}`);
    setError(null);
    try {
      await apiSend("/api/groups", "POST", { botId, jid, key, value });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const groups = data?.groups ?? [];

  return (
    <div className="space-y-4">
      <Panel
        title="Group Center"
        subtitle="Group list is synced from WhatsApp; every toggle writes to group_settings and is enforced by the bot"
        right={
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={!botId || busy !== null} onClick={sync}>
              {busy === "sync" ? "Syncing…" : "🔄 SYNC FROM WHATSAPP"}
            </button>
          </div>
        }
      >
        <select className="input sm:max-w-xs" value={botId} onChange={(e) => setBotId(e.target.value)}>
          <option value="">Select a bot…</option>
          {data?.bots.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {data && botId && !data.connected && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            This bot is not connected right now — the list below shows the last synced state. Connect it to refresh.
          </p>
        )}
        {error && <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</p>}
      </Panel>

      {loading && <p className="text-xs text-slate-500">Loading groups…</p>}
      {!loading && botId && groups.length === 0 && (
        <Empty icon="👥" title="No groups synced yet" hint="Connect the bot and press Sync from WhatsApp." />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const s = g.settings;
          const expanded = open === g.jid;
          return (
            <div key={g.jid} className="panel flex flex-col gap-3 p-4">
              <div>
                <p className="truncate text-sm font-bold text-white">{g.subject ?? g.jid}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {g.participantCount} members · {g.isAdmin ? "bot is admin" : "bot is not admin"} · {g.warnings} warned
                </p>
              </div>
              <button type="button" className="btn" onClick={() => setOpen(expanded ? null : g.jid)}>
                {expanded ? "CLOSE GROUP" : "OPEN GROUP"}
              </button>
              {expanded && (
                <div className="grid gap-2">
                  <ToggleBtn label="🛡 Anti-Link" active={Boolean(s?.antilink)} busy={busy === `${g.jid}:antilink`} onClick={() => toggle(g.jid, "antilink", !s?.antilink)} />
                  <ToggleBtn label="🗑 Anti-Delete" active={Boolean(s?.antidelete)} busy={busy === `${g.jid}:antidelete`} onClick={() => toggle(g.jid, "antidelete", !s?.antidelete)} />
                  <ToggleBtn label="🚫 Anti-Tag" active={Boolean(s?.antitag)} busy={busy === `${g.jid}:antitag`} onClick={() => toggle(g.jid, "antitag", !s?.antitag)} />
                  <ToggleBtn label="👋 Welcome" active={Boolean(s?.welcome)} busy={busy === `${g.jid}:welcome`} onClick={() => toggle(g.jid, "welcome", !s?.welcome)} />
                  <ToggleBtn label="⚠️ Warning system" active={Boolean(s?.warningEnabled)} busy={busy === `${g.jid}:warningEnabled`} onClick={() => toggle(g.jid, "warningEnabled", !s?.warningEnabled)} />
                  <ToggleBtn label="🔇 Mute group" active={Boolean(s?.muted)} busy={busy === `${g.jid}:muted`} onClick={() => toggle(g.jid, "muted", !s?.muted)} />
                  <p className="text-[10px] text-slate-500">Mute calls the real groupSettingUpdate API when the bot is connected and admin.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToggleBtn({ label, active, busy, onClick }: { label: string; active: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`btn justify-between ${active ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : ""}`}
    >
      <span>{label}</span>
      <span className="text-[10px]">{busy ? "…" : active ? "ON" : "OFF"}</span>
    </button>
  );
}
