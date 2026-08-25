"use client";

import { Panel, Empty, useApi, timeAgo } from "@/components/ui";

type Activity = { id: number; action: string; description: string; ip: string | null; createdAt: string };

const ICONS: Record<string, string> = {
  "auth.login": "🔐",
  "auth.logout": "🚪",
  "bot.create": "🤖",
  "bot.start": "▶️",
  "bot.stop": "⏹",
  "bot.restart": "♻️",
  "bot.delete": "🗑",
  "bot.pair": "📲",
  "bot.logout": "📴",
  "group.setting": "🛡",
  "downloader.run": "📥",
  "backup.create": "💾",
  "backup.restore": "♻️",
  "files.upload": "⬆️",
  "files.write": "📝",
  "files.delete": "🗑",
};

export default function ActivityPage() {
  const { data, reload } = useApi<{ activity: Activity[] }>("/api/activity");

  return (
    <Panel
      title="Activity"
      subtitle="Audit trail written on every privileged action"
      right={<button type="button" className="btn" onClick={() => void reload()}>🔄 REFRESH</button>}
    >
      {!data?.activity.length ? (
        <Empty icon="📜" title="No activity yet" />
      ) : (
        <ol className="relative space-y-2 border-l border-edge pl-4">
          {data.activity.map((a) => (
            <li key={a.id} className="relative rounded-xl border border-edge bg-black/30 p-3">
              <span className="absolute -left-[1.42rem] top-4 h-2 w-2 rounded-full bg-[#ff2e4d]" />
              <p className="text-sm text-slate-200">
                {ICONS[a.action] ?? "•"} {a.description}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {a.action} · {timeAgo(a.createdAt)} {a.ip ? `· ${a.ip}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
