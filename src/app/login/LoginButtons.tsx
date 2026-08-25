"use client";

import { useCallback, useEffect, useState } from "react";

 type Challenge = { id: string; question: string; expiresAt: number };

export default function LoginButtons() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const loadChallenge = useCallback(async () => {
    setError(null);
    setAnswer("");
    const res = await fetch("/api/auth/math/challenge", { cache: "no-store" });
    const data = (await res.json()) as Challenge & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Gagal membuat soal.");
    setChallenge(data);
  }, []);

  useEffect(() => {
    void loadChallenge().catch((err) => setError((err as Error).message));
  }, [loadChallenge]);

  useEffect(() => {
    if (!challenge) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challenge || !answer.trim() || secondsLeft === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/math/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.id, answer }),
      });
      const data = (await res.json()) as { error?: string; redirect?: string };
      if (!res.ok) throw new Error(data.error ?? "Jawaban tidak valid.");
      window.location.assign(data.redirect ?? "/dashboard");
    } catch (err) {
      setError((err as Error).message);
      await loadChallenge().catch(() => undefined);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.06] p-4 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
        <div className="flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100/75">
          <span>Verifikasi akses</span>
          <span className="font-mono text-cyan-200">{secondsLeft > 0 ? `${secondsLeft}s` : "expired"}</span>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-[#020817]/80 px-4 py-5 text-center">
          <span className="font-mono text-3xl font-black tracking-[0.15em] text-white">{challenge?.question ?? "…"}</span>
        </div>
        <form className="mt-4 flex gap-2" onSubmit={submit}>
          <input
            className="input text-center font-mono text-lg"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Jawaban"
            value={answer}
            onChange={(event) => setAnswer(event.target.value.replace(/[^0-9-]/g, ""))}
            disabled={pending || !challenge || secondsLeft === 0}
            aria-label="Jawaban soal matematika"
          />
          <button className="btn btn-web min-w-24" type="submit" disabled={pending || !answer.trim() || secondsLeft === 0}>
            {pending ? "Memeriksa…" : "Masuk"}
          </button>
        </form>
        <button type="button" className="mt-3 w-full text-xs font-semibold text-cyan-200/80 transition hover:text-white" onClick={() => void loadChallenge()} disabled={pending}>
          ↻ Dapatkan soal baru
        </button>
      </div>
      {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-center text-xs text-rose-100">{error}</p>}
      <p className="text-center text-[11px] leading-relaxed text-slate-400">Sesi aman 14 hari · soal hanya berlaku sekali · tidak ada login demo atau kredensial bawaan.</p>
    </div>
  );
}
