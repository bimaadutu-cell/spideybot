import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  jsonb,
  bigint,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* AUTH                                                                */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    username: varchar("username", { length: 80 }).notNull(),
    email: varchar("email", { length: 200 }),
    avatar: text("avatar"),
    role: varchar("role", { length: 24 }).notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), index("users_username_idx").on(t.username)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 191 }).notNull(),
    providerUsername: varchar("provider_username", { length: 191 }),
    providerEmail: varchar("provider_email", { length: 200 }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_provider_uq").on(t.provider, t.providerAccountId),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 96 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* BOTS                                                                */
/* ------------------------------------------------------------------ */

export const bots = pgTable(
  "bots",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    prefix: varchar("prefix", { length: 8 }).notNull().default("."),
    ownerNumber: varchar("owner_number", { length: 32 }),
    engine: varchar("engine", { length: 64 }).notNull().default("@whiskeysockets/baileys@6.7.22"),
    status: varchar("status", { length: 24 }).notNull().default("offline"),
    phoneNumber: varchar("phone_number", { length: 32 }),
    connectionMode: varchar("connection_mode", { length: 16 }).notNull().default("qr"),
    autoReconnect: boolean("auto_reconnect").notNull().default(true),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bots_user_idx").on(t.userId)],
);

export const botSettings = pgTable("bot_settings", {
  botId: varchar("bot_id", { length: 40 })
    .primaryKey()
    .references(() => bots.id, { onDelete: "cascade" }),
  selfMode: boolean("self_mode").notNull().default(false),
  groupsOnly: boolean("groups_only").notNull().default(false),
  autoRead: boolean("auto_read").notNull().default(false),
  autoTyping: boolean("auto_typing").notNull().default(false),
  antiCall: boolean("anti_call").notNull().default(false),
  downloaderEnabled: boolean("downloader_enabled").notNull().default(true),
  gamesEnabled: boolean("games_enabled").notNull().default(true),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botSessions = pgTable(
  "bot_sessions",
  {
    id: serial("id").primaryKey(),
    botId: varchar("bot_id", { length: 40 })
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    jid: varchar("jid", { length: 128 }),
    platform: varchar("platform", { length: 40 }),
    authPath: text("auth_path"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    lastReason: text("last_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bot_sessions_bot_idx").on(t.botId)],
);

/* ------------------------------------------------------------------ */
/* COMMANDS                                                            */
/* ------------------------------------------------------------------ */

export const commands = pgTable(
  "commands",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    description: text("description"),
    usage: varchar("usage", { length: 160 }),
    implemented: boolean("implemented").notNull().default(false),
    ownerOnly: boolean("owner_only").notNull().default(false),
    groupOnly: boolean("group_only").notNull().default(false),
    adminOnly: boolean("admin_only").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("commands_name_uq").on(t.name)],
);

export const commandSettings = pgTable(
  "command_settings",
  {
    id: serial("id").primaryKey(),
    botId: varchar("bot_id", { length: 40 })
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    commandName: varchar("command_name", { length: 64 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("command_settings_uq").on(t.botId, t.commandName)],
);

export const commandUsage = pgTable(
  "command_usage",
  {
    id: serial("id").primaryKey(),
    botId: varchar("bot_id", { length: 40 })
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    commandName: varchar("command_name", { length: 64 }).notNull(),
    chatJid: varchar("chat_jid", { length: 128 }),
    senderJid: varchar("sender_jid", { length: 128 }),
    success: boolean("success").notNull().default(true),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("command_usage_bot_idx").on(t.botId), index("command_usage_time_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* GROUPS                                                              */
/* ------------------------------------------------------------------ */

export const groups = pgTable(
  "groups",
  {
    id: serial("id").primaryKey(),
    botId: varchar("bot_id", { length: 40 })
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    jid: varchar("jid", { length: 128 }).notNull(),
    subject: varchar("subject", { length: 200 }),
    participantCount: integer("participant_count").notNull().default(0),
    isAdmin: boolean("is_admin").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("groups_bot_jid_uq").on(t.botId, t.jid)],
);

export const groupSettings = pgTable(
  "group_settings",
  {
    id: serial("id").primaryKey(),
    botId: varchar("bot_id", { length: 40 })
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    jid: varchar("jid", { length: 128 }).notNull(),
    antilink: boolean("antilink").notNull().default(false),
    antidelete: boolean("antidelete").notNull().default(false),
    antitag: boolean("antitag").notNull().default(false),
    welcome: boolean("welcome").notNull().default(false),
    welcomeText: text("welcome_text"),
    warningEnabled: boolean("warning_enabled").notNull().default(true),
    warnLimit: integer("warn_limit").notNull().default(3),
    muted: boolean("muted").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_settings_uq").on(t.botId, t.jid)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    id: serial("id").primaryKey(),
    botId: varchar("bot_id", { length: 40 })
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    jid: varchar("jid", { length: 128 }).notNull(),
    memberJid: varchar("member_jid", { length: 128 }).notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_members_uq").on(t.botId, t.jid, t.memberJid)],
);

export const warnings = pgTable(
  "warnings",
  {
    id: serial("id").primaryKey(),
    botId: varchar("bot_id", { length: 40 })
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    jid: varchar("jid", { length: 128 }).notNull(),
    memberJid: varchar("member_jid", { length: 128 }).notNull(),
    count: integer("count").notNull().default(0),
    reason: text("reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("warnings_uq").on(t.botId, t.jid, t.memberJid)],
);

/* ------------------------------------------------------------------ */
/* DOWNLOADER                                                          */
/* ------------------------------------------------------------------ */

export const downloaderProviders = pgTable(
  "downloader_providers",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 48 }).notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    platform: varchar("platform", { length: 32 }).notNull(),
    priority: integer("priority").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    status: varchar("status", { length: 16 }).notNull().default("unknown"),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    lastResponseMs: integer("last_response_ms"),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [uniqueIndex("downloader_providers_key_uq").on(t.key)],
);

export const downloaderHistory = pgTable(
  "downloader_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    botId: varchar("bot_id", { length: 40 }),
    platform: varchar("platform", { length: 32 }).notNull(),
    url: text("url").notNull(),
    provider: varchar("provider", { length: 48 }),
    status: varchar("status", { length: 16 }).notNull(),
    title: text("title"),
    mediaUrl: text("media_url"),
    mediaType: varchar("media_type", { length: 24 }),
    durationMs: integer("duration_ms"),
    attempts: jsonb("attempts").$type<{ provider: string; ok: boolean; ms: number; error?: string }[]>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("downloader_history_user_idx").on(t.userId), index("downloader_history_time_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* SYSTEM                                                              */
/* ------------------------------------------------------------------ */

export const logs = pgTable(
  "logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    botId: varchar("bot_id", { length: 40 }),
    channel: varchar("channel", { length: 24 }).notNull().default("SYSTEM"),
    level: varchar("level", { length: 16 }).notNull().default("info"),
    message: text("message").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("logs_user_idx").on(t.userId), index("logs_time_idx").on(t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 48 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 80 }).notNull(),
    description: text("description").notNull(),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_user_idx").on(t.userId)],
);

export const backups = pgTable(
  "backups",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("backups_user_idx").on(t.userId)],
);

export const metrics = pgTable(
  "metrics",
  {
    id: serial("id").primaryKey(),
    botId: varchar("bot_id", { length: 40 }),
    userId: integer("user_id"),
    cpu: real("cpu"),
    memory: real("memory"),
    eventLoopLag: real("event_loop_lag"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("metrics_time_idx").on(t.createdAt)],
);
