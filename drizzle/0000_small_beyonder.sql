CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_account_id" varchar(191) NOT NULL,
	"provider_username" varchar(191),
	"provider_email" varchar(200),
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" varchar(120) NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" varchar(40) NOT NULL,
	"jid" varchar(128),
	"platform" varchar(40),
	"auth_path" text,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"last_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_settings" (
	"bot_id" varchar(40) PRIMARY KEY NOT NULL,
	"self_mode" boolean DEFAULT false NOT NULL,
	"groups_only" boolean DEFAULT false NOT NULL,
	"auto_read" boolean DEFAULT false NOT NULL,
	"auto_typing" boolean DEFAULT false NOT NULL,
	"anti_call" boolean DEFAULT false NOT NULL,
	"downloader_enabled" boolean DEFAULT true NOT NULL,
	"games_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 20 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bots" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"prefix" varchar(8) DEFAULT '.' NOT NULL,
	"owner_number" varchar(32),
	"engine" varchar(64) DEFAULT '@whiskeysockets/baileys@6.7.22' NOT NULL,
	"status" varchar(24) DEFAULT 'offline' NOT NULL,
	"phone_number" varchar(32),
	"connection_mode" varchar(16) DEFAULT 'qr' NOT NULL,
	"auto_reconnect" boolean DEFAULT true NOT NULL,
	"last_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" varchar(40) NOT NULL,
	"command_name" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" varchar(40) NOT NULL,
	"command_name" varchar(64) NOT NULL,
	"chat_jid" varchar(128),
	"sender_jid" varchar(128),
	"success" boolean DEFAULT true NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"category" varchar(40) NOT NULL,
	"description" text,
	"usage" varchar(160),
	"implemented" boolean DEFAULT false NOT NULL,
	"owner_only" boolean DEFAULT false NOT NULL,
	"group_only" boolean DEFAULT false NOT NULL,
	"admin_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloader_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"bot_id" varchar(40),
	"platform" varchar(32) NOT NULL,
	"url" text NOT NULL,
	"provider" varchar(48),
	"status" varchar(16) NOT NULL,
	"title" text,
	"media_url" text,
	"media_type" varchar(24),
	"duration_ms" integer,
	"attempts" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloader_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(48) NOT NULL,
	"label" varchar(64) NOT NULL,
	"platform" varchar(32) NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" varchar(16) DEFAULT 'unknown' NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_response_ms" integer,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" varchar(40) NOT NULL,
	"jid" varchar(128) NOT NULL,
	"member_jid" varchar(128) NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" varchar(40) NOT NULL,
	"jid" varchar(128) NOT NULL,
	"antilink" boolean DEFAULT false NOT NULL,
	"antidelete" boolean DEFAULT false NOT NULL,
	"antitag" boolean DEFAULT false NOT NULL,
	"welcome" boolean DEFAULT false NOT NULL,
	"welcome_text" text,
	"warning_enabled" boolean DEFAULT true NOT NULL,
	"warn_limit" integer DEFAULT 3 NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" varchar(40) NOT NULL,
	"jid" varchar(128) NOT NULL,
	"subject" varchar(200),
	"participant_count" integer DEFAULT 0 NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"bot_id" varchar(40),
	"channel" varchar(24) DEFAULT 'SYSTEM' NOT NULL,
	"level" varchar(16) DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" varchar(40),
	"user_id" integer,
	"cpu" real,
	"memory" real,
	"event_loop_lag" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(48) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(96) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" varchar(32) NOT NULL,
	"user_agent" text,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"username" varchar(80) NOT NULL,
	"email" varchar(200),
	"avatar" text,
	"role" varchar(24) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" varchar(40) NOT NULL,
	"jid" varchar(128) NOT NULL,
	"member_jid" varchar(128) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD CONSTRAINT "bot_settings_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_settings" ADD CONSTRAINT "command_settings_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_usage" ADD CONSTRAINT "command_usage_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloader_history" ADD CONSTRAINT "downloader_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_settings" ADD CONSTRAINT "group_settings_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_uq" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_user_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "backups_user_idx" ON "backups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bot_sessions_bot_idx" ON "bot_sessions" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bots_user_idx" ON "bots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "command_settings_uq" ON "command_settings" USING btree ("bot_id","command_name");--> statement-breakpoint
CREATE INDEX "command_usage_bot_idx" ON "command_usage" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "command_usage_time_idx" ON "command_usage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commands_name_uq" ON "commands" USING btree ("name");--> statement-breakpoint
CREATE INDEX "downloader_history_user_idx" ON "downloader_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "downloader_history_time_idx" ON "downloader_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "downloader_providers_key_uq" ON "downloader_providers" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_uq" ON "group_members" USING btree ("bot_id","jid","member_jid");--> statement-breakpoint
CREATE UNIQUE INDEX "group_settings_uq" ON "group_settings" USING btree ("bot_id","jid");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_bot_jid_uq" ON "groups" USING btree ("bot_id","jid");--> statement-breakpoint
CREATE INDEX "logs_user_idx" ON "logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "logs_time_idx" ON "logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "metrics_time_idx" ON "metrics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "warnings_uq" ON "warnings" USING btree ("bot_id","jid","member_jid");