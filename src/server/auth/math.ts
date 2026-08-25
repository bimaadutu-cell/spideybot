import crypto from "node:crypto";

export type MathChallenge = {
  id: string;
  question: string;
  answer: number;
  expiresAt: number;
  attempts: number;
};

const CHALLENGE_TTL_MS = 5 * 60_000;
const challenges = new Map<string, MathChallenge>();

function randomInt(min: number, max: number) {
  return crypto.randomInt(min, max + 1);
}

export function createMathChallenge(): Omit<MathChallenge, "answer" | "attempts"> {
  const operation = randomInt(0, 2);
  const left = randomInt(8, 48);
  const right = operation === 2 ? randomInt(2, 12) : randomInt(4, 36);
  const answer = operation === 0 ? left + right : operation === 1 ? left - right : left * right;
  const symbol = operation === 0 ? "+" : operation === 1 ? "−" : "×";
  const id = crypto.randomBytes(18).toString("base64url");
  const challenge: MathChallenge = {
    id,
    question: `${left} ${symbol} ${right} = ?`,
    answer,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    attempts: 0,
  };
  challenges.set(id, challenge);
  pruneChallenges();
  return { id, question: challenge.question, expiresAt: challenge.expiresAt };
}

export function consumeMathChallenge(id: string, answer: string | number) {
  const challenge = challenges.get(id);
  challenges.delete(id);
  if (!challenge || challenge.expiresAt < Date.now()) return { ok: false as const, reason: "expired" as const };
  const parsed = typeof answer === "number" ? answer : Number(String(answer).trim());
  if (!Number.isFinite(parsed) || parsed !== challenge.answer) return { ok: false as const, reason: "incorrect" as const };
  return { ok: true as const };
}

function pruneChallenges() {
  const now = Date.now();
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt < now) challenges.delete(id);
  }
}
