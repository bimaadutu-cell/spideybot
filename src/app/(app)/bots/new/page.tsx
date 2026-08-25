"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Panel, Toggle, apiSend } from "@/components/ui";

const STEPS = ["01 Identity", "02 Engine", "03 Features", "04 Configuration", "05 Review", "06 Deploy"];

export default function CreateBotPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    prefix: ".",
    ownerNumber: "",
    connectionMode: "qr" as "qr" | "pairing",
    autoReconnect: true,
    features: {
      downloader: true,
      games: true,
      autoRead: false,
      autoTyping: false,
      antiCall: false,
      selfMode: false,
      groupsOnly: false,
    },
  });

  const setFeature = (key: keyof typeof form.features, value: boolean) =>
    setForm((f) => ({ ...f, features: { ...f.features, [key]: value } }));

  const submit = async (deploy: boolean) => {
    setDeploying(true);
    setError(null);
    try {
      const res = await apiSend<{ bot: { id: string } }>("/api/bots", "POST", { ...form, deploy });
      router.push(deploy ? `/connection?bot=${res.bot.id}` : "/bots");
    } catch (err) {
      setError((err as Error).message);
      setStep(4);
    } finally {
      setDeploying(false);
    }
  };

  const canNext =
    step !== 0 || (form.name.trim().length >= 2 && form.prefix.trim().length >= 1);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Panel title="Create SpideyBot" subtitle="Six-step wizard — the bot is created in PostgreSQL and deployed on the real Baileys engine">
        <div className="mb-5 flex flex-wrap gap-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => i <= step && setStep(i)}
              className={`chip ${i === step ? "border-[#ff2e4d]/60 bg-[#ff2e4d]/15 text-white" : i < step ? "border-emerald-500/40 text-emerald-300" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</p>}

        {step === 0 && (
          <div className="space-y-3">
            <Field label="Bot name">
              <input className="input" value={form.name} placeholder="SpideyBot Prime" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Description">
              <input className="input" value={form.description} placeholder="Main automation bot" onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Command prefix">
              <input className="input" value={form.prefix} maxLength={3} onChange={(e) => setForm({ ...form, prefix: e.target.value })} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-edge bg-black/40 p-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">Engine</p>
              <p className="mt-1 font-mono text-[#37e6ff]">@whiskeysockets/baileys@6.7.18</p>
              <p className="mt-2 text-xs text-slate-500">
                Multi-file auth state per bot · real QR from <code>connection.update</code> · real pairing code from{" "}
                <code>requestPairingCode()</code>.
              </p>
            </div>
            <Field label="Connection mode">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={`btn ${form.connectionMode === "qr" ? "btn-web" : ""}`} onClick={() => setForm({ ...form, connectionMode: "qr" })}>
                  🔳 QR CODE
                </button>
                <button type="button" className={`btn ${form.connectionMode === "pairing" ? "btn-web" : ""}`} onClick={() => setForm({ ...form, connectionMode: "pairing" })}>
                  📲 PAIRING CODE
                </button>
              </div>
            </Field>
            <Toggle label="Auto reconnect on disconnect" checked={form.autoReconnect} onChange={(v) => setForm({ ...form, autoReconnect: v })} />
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle label="📥 Downloader engine" checked={form.features.downloader} onChange={(v) => setFeature("downloader", v)} />
            <Toggle label="🎮 Games" checked={form.features.games} onChange={(v) => setFeature("games", v)} />
            <Toggle label="👀 Auto read" checked={form.features.autoRead} onChange={(v) => setFeature("autoRead", v)} />
            <Toggle label="⌨️ Auto typing" checked={form.features.autoTyping} onChange={(v) => setFeature("autoTyping", v)} />
            <Toggle label="📵 Anti-call" checked={form.features.antiCall} onChange={(v) => setFeature("antiCall", v)} />
            <Toggle label="🔒 Self mode (owner only)" checked={form.features.selfMode} onChange={(v) => setFeature("selfMode", v)} />
            <Toggle label="👥 Groups only" checked={form.features.groupsOnly} onChange={(v) => setFeature("groupsOnly", v)} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Field label="Owner number (international format, digits only)">
              <input className="input" value={form.ownerNumber} placeholder="6281234567890" onChange={(e) => setForm({ ...form, ownerNumber: e.target.value })} />
            </Field>
            <p className="text-xs text-slate-500">
              The owner number unlocks owner-only commands such as <code>.addowner</code>.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2 text-sm">
            <Row k="Name" v={form.name || "-"} />
            <Row k="Description" v={form.description || "-"} />
            <Row k="Prefix" v={form.prefix} />
            <Row k="Owner" v={form.ownerNumber || "-"} />
            <Row k="Engine" v="@whiskeysockets/baileys@6.7.18" />
            <Row k="Connection" v={form.connectionMode === "qr" ? "QR code" : "Pairing code"} />
            <Row k="Auto reconnect" v={form.autoReconnect ? "yes" : "no"} />
            <Row k="Features" v={Object.entries(form.features).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"} />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Deploy will insert the bot into PostgreSQL and immediately boot a real Baileys socket. The QR / pairing
              code arrives over the realtime stream in the Connection Center.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn btn-primary flex-1" disabled={deploying} onClick={() => submit(true)}>
                {deploying ? "Deploying…" : "🚀 DEPLOY & CONNECT"}
              </button>
              <button type="button" className="btn flex-1" disabled={deploying} onClick={() => submit(false)}>
                💾 SAVE WITHOUT STARTING
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2">
          <button type="button" className="btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            ← BACK
          </button>
          <button
            type="button"
            className="btn btn-web"
            disabled={step === STEPS.length - 1 || !canNext}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          >
            NEXT →
          </button>
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-edge/60 py-1.5">
      <span className="text-slate-500">{k}</span>
      <span className="text-right text-slate-200">{v}</span>
    </div>
  );
}
