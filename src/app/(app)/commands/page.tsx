"use client";

import { useMemo, useState } from "react";
import { Panel, Empty, useApi, apiSend } from "@/components/ui";

type CommandInfo = {
  name: string;
  category: string;
  description: string;
  usage: string | null;
  ownerOnly: boolean;
  groupOnly: boolean;
  adminOnly: boolean;
  available: boolean;
  blockers: string[];
  enabled: boolean;
  uses: number;
};

type Payload = {
  commands: CommandInfo[];
  bots: { id: string; name: string }[];
  recent: { id: number; commandName: string; success: boolean; durationMs: number | null; createdAt: string }[];
};

type SelfTestResult = {
  name: string;
  category: string;
  status: "pass" | "fail" | "skipped";
  reason?: string;
  durationMs: number;
  outputs: string[];
};

type SelfTestReport = {
  summary: { total: number; passed: number; failed: number; skipped: number; networkIncluded: boolean };
  results: SelfTestResult[];
};

export default function CommandsPage() {
  const [botId, setBotId] = useState<string>("");
  const { data, reload } = useApi<Payload>(`/api/commands${botId ? `?botId=${botId}` : ""}`, [botId]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [network, setNetwork] = useState(false);
  const [report, setReport] = useState<SelfTestReport | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const runSelfTest = async () => {
    if (!botId) return;
    setTesting(true);
    setTestError(null);
    setReport(null);
    try {
      const res = await apiSend<SelfTestReport>("/api/diagnostics/commands", "POST", { botId, network });
      setReport(res);
    } catch (err) {
      setTestError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const categories = useMemo(
    () => ["all", ...new Set((data?.commands ?? []).map((c) => c.category))],
    [data],
  );

  const filtered = (data?.commands ?? []).filter(
    (c) =>
      (category === "all" || c.category === category) &&
      (query === "" || c.name.includes(query.toLowerCase()) || c.description.toLowerCase().includes(query.toLowerCase())),
  );

  const toggle = async (command: string, enabled: boolean) => {
    if (!botId) return;
    setBusy(command);
    try {
      await apiSend("/api/commands", "POST", { botId, command, enabled });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const available = (data?.commands ?? []).filter((c) => c.available).length;

  return (
    <div className="space-y-4">
      <Panel
        title="Command Engine"
        subtitle={`Auto-built registry · ${available}/${data?.commands.length ?? 0} commands available on this host`}
        right={<button type="button" className="btn" onClick={() => void reload()}>🔄 RELOAD REGISTRY</button>}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <select className="input sm:max-w-xs" value={botId} onChange={(e) => setBotId(e.target.value)}>
            <option value="">Registry only (select a bot to toggle)</option>
            {data?.bots.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <input className="input" placeholder="Search commands…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button key={cat} type="button" className={`btn ${category === cat ? "btn-web" : ""}`} onClick={() => setCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title="Command self-test"
        subtitle="Executes the real command implementations and shows the output they produce. Commands that need a live WhatsApp session, a media attachment or a missing host dependency are reported as skipped — never as passing."
        right={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`btn ${network ? "btn-web" : ""}`} onClick={() => setNetwork((n) => !n)}>
              {network ? "🌐 NETWORK TESTS ON" : "🌐 NETWORK TESTS OFF"}
            </button>
            <button type="button" className="btn btn-primary" disabled={!botId || testing} onClick={runSelfTest}>
              {testing ? "Running…" : "🧪 RUN SELF-TEST"}
            </button>
          </div>
        }
      >
        {!botId && <p className="text-xs text-slate-500">Select a bot above to run the self-test.</p>}
        {testError && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">{testError}</p>}
        {report && (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="chip border-emerald-500/40 text-emerald-300">{report.summary.passed} passed</span>
              <span className="chip border-rose-500/40 text-rose-300">{report.summary.failed} failed</span>
              <span className="chip border-slate-500/40 text-slate-400">{report.summary.skipped} skipped</span>
              <span className="chip">{report.summary.total} total</span>
            </div>
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {report.results
                .filter((r) => r.status !== "skipped")
                .concat(report.results.filter((r) => r.status === "skipped"))
                .map((r) => (
                  <div key={r.name} className="rounded-lg border border-edge bg-black/30 p-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-slate-200">
                        {r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "⏭"} .{r.name}
                      </span>
                      <span className="text-slate-600">{r.durationMs}ms · {r.category}</span>
                    </div>
                    {r.reason && <p className="mt-1 text-slate-500">{r.reason}</p>}
                    {r.outputs.map((o, i) => (
                      <p key={i} className="mt-1 break-words font-mono text-[10px] text-[#37e6ff]">↳ {o}</p>
                    ))}
                  </div>
                ))}
            </div>
          </>
        )}
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((cmd) => (
          <div key={cmd.name} className="panel flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-sm font-bold text-white">.{cmd.name}</p>
              <span className={`chip ${cmd.available ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}>
                {cmd.available ? "ready" : "unavailable"}
              </span>
            </div>
            <p className="text-xs text-slate-400">{cmd.description}</p>
            {cmd.usage && <p className="font-mono text-[11px] text-slate-500">{cmd.usage}</p>}
            {!cmd.available && <p className="text-[11px] text-amber-300/80">⚠️ {cmd.blockers.join(", ")}</p>}
            <div className="flex flex-wrap gap-1 text-[10px] text-slate-500">
              <span className="chip">{cmd.category}</span>
              {cmd.ownerOnly && <span className="chip border-fuchsia-500/40 text-fuchsia-300">owner</span>}
              {cmd.groupOnly && <span className="chip border-sky-500/40 text-sky-300">group</span>}
              {cmd.adminOnly && <span className="chip border-amber-500/40 text-amber-300">admin</span>}
              {botId && <span className="chip">{cmd.uses} uses</span>}
            </div>
            {botId && (
              <button
                type="button"
                className={`btn mt-auto ${cmd.enabled ? "border-emerald-500/40 text-emerald-300" : "btn-danger"}`}
                disabled={busy === cmd.name}
                onClick={() => toggle(cmd.name, !cmd.enabled)}
              >
                {busy === cmd.name ? "…" : cmd.enabled ? "✅ ENABLED — click to disable" : "🚫 DISABLED — click to enable"}
              </button>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && <Empty icon="⚡" title="No commands match the filter" />}

      {botId && data?.recent.length ? (
        <Panel title="Recent executions" subtitle="From the command_usage table">
          <div className="terminal space-y-1 rounded-xl bg-black/50 p-3">
            {data.recent.map((r) => (
              <div key={r.id} className="flex gap-2">
                <span className="text-slate-600">{new Date(r.createdAt).toLocaleTimeString()}</span>
                <span className={r.success ? "text-emerald-400" : "text-rose-400"}>.{r.commandName}</span>
                <span className="text-slate-500">{r.durationMs ?? 0}ms</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
