import type { CommandDef } from "./types";
import { setQuiz, getQuiz, clearQuiz, getLobby, setLobby, clearLobby, activeGames } from "./state";

type QuizQuestion = { q: string; a: string; difficulty: "easy" | "normal" };

const QUIZ_BANK: QuizQuestion[] = [
  { q: "What protocol does WhatsApp Web use for its binary frames?", a: "websocket", difficulty: "normal" },
  { q: "Which library powers SpideyBot's WhatsApp engine?", a: "baileys", difficulty: "easy" },
  { q: "What does QR stand for?", a: "quick response", difficulty: "easy" },
  { q: "Which HTTP status code means 'Too Many Requests'?", a: "429", difficulty: "normal" },
  { q: "What is the capital of Indonesia?", a: "jakarta", difficulty: "easy" },
  { q: "In JavaScript, what does JSON stand for?", a: "javascript object notation", difficulty: "easy" },
  { q: "Which database does SpideyBot store its data in?", a: "postgresql", difficulty: "normal" },
  { q: "What is 12 x 12?", a: "144", difficulty: "easy" },
  { q: "Which encryption does WhatsApp use end-to-end?", a: "signal", difficulty: "normal" },
  { q: "What port does PostgreSQL listen on by default?", a: "5432", difficulty: "normal" },
];

function pick(difficulty?: "easy") {
  const pool = difficulty ? QUIZ_BANK.filter((q) => q.difficulty === "easy") : QUIZ_BANK;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const gameCommands: CommandDef[] = [
  {
    name: "quiz",
    category: "games",
    description: "Start a quiz round — answer straight in the chat",
    async run(ctx) {
      const existing = getQuiz(ctx.rt.id, ctx.from);
      if (existing && Date.now() - existing.asked < 90_000) {
        return ctx.reply(`❓ A quiz is already running:\n\n*${existing.question}*`);
      }
      const q = pick();
      setQuiz(ctx.rt.id, ctx.from, { question: q.q, answer: q.a, asked: Date.now(), difficulty: q.difficulty });
      await ctx.reply(`🎮 *QUIZ* (${q.difficulty})\n\n${q.q}\n\n_Type your answer in this chat — 90s._`);
    },
  },
  {
    name: "quiz-easy",
    category: "games",
    description: "Start an easy quiz round",
    async run(ctx) {
      const q = pick("easy");
      setQuiz(ctx.rt.id, ctx.from, { question: q.q, answer: q.a, asked: Date.now(), difficulty: "easy" });
      await ctx.reply(`🎮 *QUIZ — EASY*\n\n${q.q}\n\n_Type your answer in this chat — 90s._`);
    },
  },
  {
    name: "tebakgambar",
    category: "games",
    description: "Picture guessing game (needs an image question pack)",
    requires: ["env:TEBAKGAMBAR_API"],
    async run(ctx) {
      await ctx.reply("❌ tebakgambar needs an image question pack (TEBAKGAMBAR_API). Not configured.");
    },
  },
  {
    name: "werewolf",
    category: "games",
    description: "Werewolf lobby — create, join and start with real role assignment",
    usage: ".werewolf create|join|start|stop",
    groupOnly: true,
    async run(ctx) {
      const action = (ctx.args[0] ?? "create").toLowerCase();
      const lobby = getLobby(ctx.rt.id, ctx.from);
      if (action === "create") {
        if (lobby) return ctx.reply("A game lobby already exists in this group.");
        setLobby(ctx.rt.id, ctx.from, {
          game: "werewolf",
          players: [ctx.sender],
          started: false,
          host: ctx.sender,
          createdAt: Date.now(),
        });
        return ctx.reply(`🐺 *WEREWOLF* lobby created by @${ctx.sender.split("@")[0]}.\nType ${ctx.prefix}werewolf join`);
      }
      if (!lobby) return ctx.reply(`No lobby. Create one with ${ctx.prefix}werewolf create`);
      if (action === "join") {
        if (lobby.started) return ctx.reply("The game already started.");
        if (lobby.players.includes(ctx.sender)) return ctx.reply("You already joined.");
        lobby.players.push(ctx.sender);
        setLobby(ctx.rt.id, ctx.from, lobby);
        return ctx.reply(`✅ Joined. Players: ${lobby.players.length}`);
      }
      if (action === "start") {
        if (lobby.players.length < 4) return ctx.reply("Need at least 4 players.");
        const roles = ["🐺 Werewolf", "🔮 Seer", "🛡 Guardian", ...Array(lobby.players.length - 3).fill("🧑 Villager")];
        const shuffled = [...roles].sort(() => Math.random() - 0.5);
        lobby.started = true;
        setLobby(ctx.rt.id, ctx.from, lobby);
        for (let i = 0; i < lobby.players.length; i++) {
          await ctx.sock.sendMessage(lobby.players[i], {
            text: `🐺 *WEREWOLF*\nYour role: *${shuffled[i]}*\nGroup: ${ctx.groupMeta?.subject ?? ctx.from}`,
          });
        }
        return ctx.reply("🌙 Roles were sent by DM. Night falls…");
      }
      if (action === "stop") {
        clearLobby(ctx.rt.id, ctx.from);
        return ctx.reply("🛑 Lobby closed.");
      }
      return ctx.reply(`Usage: ${ctx.prefix}werewolf create|join|start|stop`);
    },
  },
  {
    name: "remi",
    category: "games",
    description: "Remi card lobby — deals a real shuffled hand to each player by DM",
    usage: ".remi create|join|start|stop",
    groupOnly: true,
    async run(ctx) {
      const action = (ctx.args[0] ?? "create").toLowerCase();
      const lobby = getLobby(ctx.rt.id, ctx.from);
      if (action === "create") {
        if (lobby) return ctx.reply("A game lobby already exists in this group.");
        setLobby(ctx.rt.id, ctx.from, {
          game: "remi",
          players: [ctx.sender],
          started: false,
          host: ctx.sender,
          createdAt: Date.now(),
        });
        return ctx.reply(`🃏 *REMI* lobby created. Type ${ctx.prefix}remi join`);
      }
      if (!lobby) return ctx.reply(`No lobby. Create one with ${ctx.prefix}remi create`);
      if (action === "join") {
        if (lobby.players.includes(ctx.sender)) return ctx.reply("You already joined.");
        lobby.players.push(ctx.sender);
        setLobby(ctx.rt.id, ctx.from, lobby);
        return ctx.reply(`✅ Joined. Players: ${lobby.players.length}`);
      }
      if (action === "start") {
        if (lobby.players.length < 2) return ctx.reply("Need at least 2 players.");
        const suits = ["♠", "♥", "♦", "♣"];
        const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
        const deck = suits.flatMap((s) => ranks.map((r) => `${r}${s}`)).sort(() => Math.random() - 0.5);
        lobby.started = true;
        setLobby(ctx.rt.id, ctx.from, lobby);
        for (let i = 0; i < lobby.players.length; i++) {
          const hand = deck.slice(i * 7, i * 7 + 7);
          await ctx.sock.sendMessage(lobby.players[i], { text: `🃏 *REMI*\nYour hand:\n${hand.join("  ")}` });
        }
        return ctx.reply("🃏 Hands dealt by DM. Good luck!");
      }
      clearLobby(ctx.rt.id, ctx.from);
      return ctx.reply("🛑 Lobby closed.");
    },
  },
  {
    name: "gamecheck",
    category: "games",
    description: "Show active game sessions handled by this bot",
    async run(ctx) {
      const games = activeGames().filter((g) => g.key.startsWith(ctx.rt.id));
      const quiz = getQuiz(ctx.rt.id, ctx.from);
      const lines = [
        `🎮 *GAME STATUS*`,
        `Active lobbies: ${games.length}`,
        ...games.map((g) => `• ${g.game} — ${g.players.length} players ${g.started ? "(running)" : "(waiting)"}`),
        quiz ? `Quiz running in this chat: ${quiz.question}` : "No quiz running in this chat.",
      ];
      await ctx.reply(lines.join("\n"));
    },
  },
];

/** Called by the message handler for non-command messages. */
export function checkQuizAnswer(botId: string, chat: string, text: string) {
  const quiz = getQuiz(botId, chat);
  if (!quiz) return null;
  if (Date.now() - quiz.asked > 90_000) {
    clearQuiz(botId, chat);
    return { expired: true, answer: quiz.answer };
  }
  if (text.trim().toLowerCase() === quiz.answer.toLowerCase()) {
    clearQuiz(botId, chat);
    return { correct: true, answer: quiz.answer };
  }
  return null;
}
