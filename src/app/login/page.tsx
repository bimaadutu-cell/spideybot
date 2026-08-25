import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import LoginButtons from "./LoginButtons";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="web-grid relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="panel glow-blue border-cyan-300/20 p-7 sm:p-9">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-200/30 bg-cyan-300/10 text-5xl shadow-[0_0_32px_rgba(34,211,238,0.22)]">🕷️</div>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.34em] text-cyan-200">Secure control plane</p>
            <h1 className="mt-2 text-3xl font-black tracking-[0.22em] text-white">SPIDEYBOT</h1>
            <p className="mt-2 text-sm text-slate-300">WhatsApp Automation Platform</p>
          </div>

          <LoginButtons />
        </div>

        <div className="panel mt-4 border-white/10 p-4 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-white"><span className="h-2 w-2 rounded-full bg-cyan-300 live-dot" /> Local access verification enabled</div>
          <p className="mt-2 leading-relaxed">Gunakan jawaban soal yang tampil untuk membuka dashboard. Setiap challenge dibuat server-side, kedaluwarsa otomatis, dan tidak disimpan di browser.</p>
        </div>
      </div>
    </main>
  );
}
