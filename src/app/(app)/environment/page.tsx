"use client";

import { useState } from "react";
import { Panel, useApi } from "@/components/ui";

type Variable = { key: string; value: string; secret: boolean; present?: boolean; source?: string };
type Payload = {
  variables: Variable[];
  runtime: { nodeEnv: string; baileys: string; ffmpeg: boolean; sharp: boolean };
  auth: {
    ready: boolean;
    appUrl: string;
    google: { configured: boolean; callbackUrl: string; missing: string[] };
    github: { configured: boolean; callbackUrl: string; missing: string[] };
    missing: string[];
  };
};

export default function EnvironmentPage() {
  const { data } = useApi<Payload>("/api/environment");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-4">
      <Panel title="Environment" subtitle="Secret values are never sent to the browser — only presence flags">
        <div className="space-y-2">
          {data?.variables.map((v) => (
            <div key={v.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge bg-black/30 p-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-slate-200">{v.key}</p>
                <p className="truncate font-mono text-[11px] text-slate-500">{v.value}</p>
              </div>
              <div className="flex items-center gap-2">
                {v.source && <span className="chip">{v.source}</span>}
                <span className={`chip ${v.present === false ? "border-rose-500/40 text-rose-300" : "border-emerald-500/40 text-emerald-300"}`}>
                  {v.present === false ? "missing" : v.secret ? "secret set" : "public"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="OAuth callbacks" subtitle="Register exactly these URLs in the provider consoles">
        <div className="space-y-3 text-xs">
          <CallbackRow
            label="Google authorized redirect URI"
            url={data?.auth.google.callbackUrl ?? ""}
            ok={Boolean(data?.auth.google.configured)}
            missing={data?.auth.google.missing ?? []}
            onCopy={() => copy(data?.auth.google.callbackUrl ?? "", "google")}
            copied={copied === "google"}
          />
          <CallbackRow
            label="GitHub authorization callback URL"
            url={data?.auth.github.callbackUrl ?? ""}
            ok={Boolean(data?.auth.github.configured)}
            missing={data?.auth.github.missing ?? []}
            onCopy={() => copy(data?.auth.github.callbackUrl ?? "", "github")}
            copied={copied === "github"}
          />
          <p className="text-slate-500">
            Detected APP_URL: <span className="font-mono text-slate-300">{data?.auth.appUrl}</span> — set the{" "}
            <code>APP_URL</code> env var to pin it for sandbox/production deployments.
          </p>
        </div>
      </Panel>

      <Panel title="Runtime capabilities" subtitle="What this host can actually do right now">
        <div className="grid gap-2 sm:grid-cols-2">
          <Capability label="Baileys engine" value={data?.runtime.baileys ?? ""} ok />
          <Capability label="NODE_ENV" value={data?.runtime.nodeEnv ?? ""} ok />
          <Capability label="sharp (image processing)" value={data?.runtime.sharp ? "installed" : "not installed"} ok={Boolean(data?.runtime.sharp)} />
          <Capability label="ffmpeg (audio/video)" value={data?.runtime.ffmpeg ? "installed" : "not installed — related commands are disabled"} ok={Boolean(data?.runtime.ffmpeg)} />
        </div>
      </Panel>
    </div>
  );
}

function CallbackRow({
  label,
  url,
  ok,
  missing,
  onCopy,
  copied,
}: {
  label: string;
  url: string;
  ok: boolean;
  missing: string[];
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-xl border border-edge bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-slate-300">{label}</p>
        <span className={`chip ${ok ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}>
          {ok ? "configured" : "incomplete"}
        </span>
      </div>
      <p className="mt-1 break-all font-mono text-[11px] text-[#37e6ff]">{url || "APP_URL not detected"}</p>
      {missing.length > 0 && <p className="mt-1 text-[11px] text-amber-300/80">Missing: {missing.join(", ")}</p>}
      <button type="button" className="btn mt-2 px-3 py-1 text-[11px]" onClick={onCopy}>
        {copied ? "✅ COPIED" : "📋 COPY URL"}
      </button>
    </div>
  );
}

function Capability({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-edge bg-black/30 p-3 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className={ok ? "text-emerald-300" : "text-amber-300"}>{value}</span>
    </div>
  );
}
