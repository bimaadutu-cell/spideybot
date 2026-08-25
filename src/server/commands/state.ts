/** In-memory runtime state shared by group protections and games. */

type AfkEntry = { reason: string; since: number };
type QuizEntry = { question: string; answer: string; asked: number; difficulty: string };
type Lobby = { game: "werewolf" | "remi"; players: string[]; started: boolean; host: string; createdAt: number };

type State = {
  afk: Map<string, AfkEntry>;
  custom: Map<string, string>;
  quiz: Map<string, QuizEntry>;
  lobbies: Map<string, Lobby>;
  messageCache: Map<string, { text: string; sender: string; ts: number }>;
};

const globalForState = globalThis as typeof globalThis & { __spideyCmdState?: State };

function state(): State {
  if (!globalForState.__spideyCmdState) {
    globalForState.__spideyCmdState = {
      afk: new Map(),
      custom: new Map(),
      quiz: new Map(),
      lobbies: new Map(),
      messageCache: new Map(),
    };
  }
  return globalForState.__spideyCmdState;
}

const key = (...parts: string[]) => parts.join("::");

export function setAfk(botId: string, jid: string, reason: string) {
  state().afk.set(key(botId, jid), { reason, since: Date.now() });
}
export function getAfk(botId: string, jid: string) {
  return state().afk.get(key(botId, jid)) ?? null;
}
export function clearAfk(botId: string, jid: string) {
  state().afk.delete(key(botId, jid));
}

export function setCustomReply(botId: string, chat: string, keyword: string, response: string) {
  state().custom.set(key(botId, chat, keyword), response);
}
export function getCustomReply(botId: string, chat: string, text: string) {
  const lower = text.toLowerCase().trim();
  return state().custom.get(key(botId, chat, lower)) ?? null;
}

export function setQuiz(botId: string, chat: string, entry: QuizEntry) {
  state().quiz.set(key(botId, chat), entry);
}
export function getQuiz(botId: string, chat: string) {
  return state().quiz.get(key(botId, chat)) ?? null;
}
export function clearQuiz(botId: string, chat: string) {
  state().quiz.delete(key(botId, chat));
}

export function getLobby(botId: string, chat: string) {
  return state().lobbies.get(key(botId, chat)) ?? null;
}
export function setLobby(botId: string, chat: string, lobby: Lobby) {
  state().lobbies.set(key(botId, chat), lobby);
}
export function clearLobby(botId: string, chat: string) {
  state().lobbies.delete(key(botId, chat));
}
export function activeGames() {
  return [...state().lobbies.entries()].map(([k, v]) => ({ key: k, ...v }));
}

export function cacheMessage(botId: string, id: string, entry: { text: string; sender: string; ts: number }) {
  const cache = state().messageCache;
  cache.set(key(botId, id), entry);
  if (cache.size > 2000) {
    const oldest = [...cache.keys()].slice(0, 500);
    for (const k of oldest) cache.delete(k);
  }
}
export function readCachedMessage(botId: string, id: string) {
  return state().messageCache.get(key(botId, id)) ?? null;
}
