"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Panel, Toggle, Empty, useApi, apiSend } from "@/components/ui";

type Bot = { id: string; name: string; description: string | null; prefix: string; ownerNumber: string | null; autoReconnect: boolean; connectionMode: string };
type Settings = {
  selfMode: boolean;
  groupsOnly: boolean;
  autoRead: boolean;
  autoTyping: boolean;
  antiCall: boolean;
  downloaderEnabled: boolean;
  gamesEnabled: boolean;
  rateLimitPerMinute: number;
};

function SettingsInner() {
  const params = useSearchParams();
  const list = useApi<{ bots: Bot[] }>("/api/bots");
  const [botId, setBotId] = useState(params.get("bot") ?? "");
  const detail = useApi<{ bot: Bot; settings: Settings }>(botId ? `/api/bots/${botId}` : null, [botId]);
  const [form, setForm] = useState<(Bot & Settings) | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!botId && list.data?.bots.length) setBotId(list.data.bots[0].id);
  }, [list.data, botId]);

  useEffect(() => {
    if (detail.data?.bot && detail.data.settings) setForm({ ...detail.data.bot, ...detail.data.settings });
  }, [detail.data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiSend(`/api/bots/${botId}`, "PATCH", form);
      setMsg("Saved — the running bot picks the change up immediately.");
      await detail.reload();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Settings" subtitle="Per-bot configuration written to bots / bot_settings">
        <select className="input sm:max-w-xs" value={botId} onChange={(e) => setBotId(e.target.value)}>
          <option value="">Select a bot…</option>
          {list.data?.bots.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </Panel>

      {!botId && <Empty icon="⚙️" title="Select a bot to configure" />}

      {form && (
        <>
          <Panel title="Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Name</span>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Prefix</span>
                <input className="input" maxLength={3} value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Description</span>
                <input className="input" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Owner number</span>
                <input className="input" value={form.ownerNumber ?? ""} onChange={(e) => setForm({ ...form, ownerNumber: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">Rate limit / minute</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={120}
                  value={form.rateLimitPerMinute}
                  onChange={(e) => setForm({ ...form, rateLimitPerMinute: Number(e.target.value) })}
                />
              </label>
            </div>
          </Panel>

          <Panel title="Behaviour">
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle label="♻️ Auto reconnect" checked={form.autoReconnect} onChange={(v) => setForm({ ...form, autoReconnect: v })} />
              <Toggle label="📥 Downloader engine" checked={form.downloaderEnabled} onChange={(v) => setForm({ ...form, downloaderEnabled: v })} />
              <Toggle label="🎮 Games" checked={form.gamesEnabled} onChange={(v) => setForm({ ...form, gamesEnabled: v })} />
              <Toggle label="👀 Auto read" checked={form.autoRead} onChange={(v) => setForm({ ...form, autoRead: v })} />
              <Toggle label="⌨️ Auto typing" checked={form.autoTyping} onChange={(v) => setForm({ ...form, autoTyping: v })} />
              <Toggle label="📵 Anti-call" checked={form.antiCall} onChange={(v) => setForm({ ...form, antiCall: v })} />
              <Toggle label="🔒 Self mode" checked={form.selfMode} onChange={(v) => setForm({ ...form, selfMode: v })} />
              <Toggle label="👥 Groups only" checked={form.groupsOnly} onChange={(v) => setForm({ ...form, groupsOnly: v })} />
            </div>
            {msg && <p className="mt-3 rounded-lg border border-edge bg-black/40 p-2 text-xs text-slate-300">{msg}</p>}
            <button type="button" className="btn btn-primary mt-4 w-full" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "💾 SAVE CONFIGURATION"}
            </button>
          </Panel>
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-xs text-slate-500">Loading settings…</p>}>
      <SettingsInner />
    </Suspense>
  );
}
