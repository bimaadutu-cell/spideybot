"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRealtime } from "@/components/RealtimeProvider";
import { Panel, StatusChip, Empty, useApi, apiSend } from "@/components/ui";

type Bot = { id: string; name: string; status: string; connectionMode: string; runtime: { status: string; qr: { dataUrl: string } | null; pairing: { code: string } | null; jid: string | null; lastError: string | null } };

function ConnectionCenter() {
  const params = useSearchParams();
  const { data, reload } = useApi<{ bots: Bot[] }>("/api/bots");
  const { runtimes, events } = useRealtime();
  const [selected, setSelected] = useState<string | null>(params.get("bot"));
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef<string | null>(null);

  useEffect(() => {
    if (!selected && data?.bots.length) setSelected(data.bots[0].id);
  }, [data, selected]);

  const bot = data?.bots.find((b) => b.id === selected) ?? null;
  const rt = bot ? (runtimes[bot.id] ?? bot.runtime) : null;
  const qr = (rt as { qr?: { dataUrl: string } | null })?.qr ?? null;
  const pairing = (rt as { pairing?: { code: string } | null })?.pairing ?? null;

  const act = async (action: string, extra?: Record<string, unknown>) => {
    if (!bot) return;
    setBusy(action);
    setError(null);
    try {
      await apiSend(`/api/bots/${bot.id}/actions`, "POST", { action, ...extra });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const botEvents = events.filter((e) => e.botId === selected).slice(-25).reverse();

  useEffect(() => {
    if (!bot || busy || autoStarted.current === bot.id) return;
    const status = rt?.status ?? "offline";
    if (["offline", "disconnected"].includes(status)) {
      autoStarted.current = bot.id;
      void act("start");
    }
  }, [bot, busy, rt?.status]);

  return (
    <div className="space-y-4">
      <Panel
        title="Connection Center"
        subtitle="QR codes and pairing codes are produced by the real Baileys socket — never generated locally"
        right={<button type="button" className="btn" onClick={() => void reload()}>🔄 REFRESH</button>}
      >
        {!data?.bots.length ? (
          <Empty icon="📱" title="No bots to connect" hint="Create a bot first." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.bots.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelected(b.id)}
                className={`btn ${selected === b.id ? "btn-web" : ""}`}
              >
                🤖 {b.name}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {bot && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={bot.name} subtitle={rt?.jid ?? "not linked to a WhatsApp account yet"} right={<StatusChip status={rt?.status ?? "offline"} />}>
            {error && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</p>}
            {rt?.lastError && <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">Last engine message: {rt.lastError}</p>}

            <div className="flex min-h-[19rem] flex-col items-center justify-center rounded-xl border border-edge bg-black/40 p-4">
              {qr ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr.dataUrl} alt="WhatsApp QR" className="h-56 w-56 rounded-lg bg-white p-2 sm:h-64 sm:w-64" />
                  <p className="mt-3 text-center text-xs text-slate-400">
                    Open WhatsApp → Linked devices → Link a device, then scan this code.
                    <br />QR rotates automatically until the pairing succeeds.
                  </p>
                </>
              ) : pairing ? (
                <>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Pairing code</p>
                  <p className="mt-3 font-mono text-4xl font-black tracking-[0.35em] text-[#37e6ff]">{pairing.code}</p>
                  <p className="mt-3 max-w-xs text-center text-xs text-slate-400">
                    WhatsApp → Linked devices → Link with phone number, then enter this code.
                  </p>
                </>
              ) : rt?.status === "connected" ? (
                <div className="text-center">
                  <div className="text-6xl">🟢</div>
                  <p className="mt-3 text-sm font-bold text-emerald-300">WhatsApp connected</p>
                  <p className="text-xs text-slate-500">{rt.jid}</p>
                </div>
              ) : (
                <div className="text-center text-slate-500">
                  <div className="text-5xl">🔳</div>
                  <p className="mt-3 text-center text-xs text-slate-500">QR otomatis diminta dari WhatsApp saat halaman koneksi dibuka.<br />Untuk pairing code, masukkan nomor terlebih dahulu di bawah.</p>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-web" disabled={busy !== null} onClick={() => act("start")}>
                {busy === "start" ? "Starting…" : "▶️ START / SHOW QR"}
              </button>
              <button type="button" className="btn" disabled={busy !== null} onClick={() => act("stop")}>⏹ STOP</button>
              <button type="button" className="btn" disabled={busy !== null} onClick={() => act("restart")}>♻️ RESTART</button>
              <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => act("logout")}>🚪 LOGOUT DEVICE</button>
            </div>

            <div className="mt-4 rounded-xl border border-edge p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pairing code · nomor wajib diisi</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input className="input" placeholder="6281234567890" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-primary sm:w-auto"
                  disabled={busy !== null || phone.replace(/\D/g, "").length < 8}
                  onClick={() => act("pair", { phone })}
                >
                  {busy === "pair" ? "Requesting…" : "📲 USE PAIRING CODE"}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                Masukkan nomor internasional tanpa tanda +, lalu kode diminta langsung dari server WhatsApp.
              </p>
            </div>
          </Panel>

          <Panel title="Connection log" subtitle="Realtime Baileys events for this bot">
            {botEvents.length === 0 ? (
              <Empty icon="📡" title="No events yet" hint="Events appear as soon as the socket starts." />
            ) : (
              <div className="terminal max-h-[26rem] space-y-1 overflow-y-auto rounded-xl bg-black/50 p-3">
                {botEvents.map((e, i) => (
                  <div key={e.id ?? i} className="flex gap-2">
                    <span className="text-slate-600">{new Date(e.ts).toLocaleTimeString()}</span>
                    <span className={e.level === "error" ? "text-rose-400" : "text-[#37e6ff]"}>{e.channel ?? e.type}</span>
                    <span className="text-slate-300">{e.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Link href="/terminal" className="btn flex-1">🖥 OPEN TERMINAL</Link>
              <button type="button" className="btn flex-1" disabled={busy !== null} onClick={() => act("sync-groups")}>
                👥 SYNC GROUPS
              </button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

export default function ConnectionPage() {
  return (
    <Suspense fallback={<p className="text-xs text-slate-500">Loading connection center…</p>}>
      <ConnectionCenter />
    </Suspense>
  );
}
