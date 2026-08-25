import { db } from "@/db";
import { commands as commandsTable, commandSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generalCommands } from "./general";
import { downloaderCommands } from "./downloader";
import { groupCommands, ownerCommands } from "./groups";
import { gameCommands } from "./games";
import { toolCommands } from "./tools";
import { commandAvailability, type CommandDef } from "./types";

/** Auto-built registry: every module contributes its own commands. */
const REGISTRY: CommandDef[] = [
  ...generalCommands,
  ...downloaderCommands,
  ...gameCommands,
  ...groupCommands,
  ...ownerCommands,
  ...toolCommands,
];

export function allCommands() {
  return [...REGISTRY].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function findCommand(name: string) {
  const lower = name.toLowerCase();
  return REGISTRY.find((c) => c.name === lower || c.aliases?.includes(lower)) ?? null;
}

export function categories() {
  return [...new Set(REGISTRY.map((c) => c.category))].sort();
}

export type CommandInfo = {
  name: string;
  category: string;
  description: string;
  usage: string | null;
  ownerOnly: boolean;
  groupOnly: boolean;
  adminOnly: boolean;
  available: boolean;
  blockers: string[];
  requires: string[];
};

export async function describeCommands(): Promise<CommandInfo[]> {
  return Promise.all(
    allCommands().map(async (def) => {
      const { available, blockers } = await commandAvailability(def);
      return {
        name: def.name,
        category: def.category,
        description: def.description,
        usage: def.usage ?? null,
        ownerOnly: Boolean(def.ownerOnly),
        groupOnly: Boolean(def.groupOnly),
        adminOnly: Boolean(def.adminOnly),
        available,
        blockers,
        requires: (def.requires ?? []).map(String),
      };
    }),
  );
}

/** Mirror the in-code registry into the database so the UI can join settings. */
export async function syncRegistryToDatabase() {
  const described = await describeCommands();
  for (const info of described) {
    await db
      .insert(commandsTable)
      .values({
        name: info.name,
        category: info.category,
        description: info.description,
        usage: info.usage,
        implemented: info.available,
        ownerOnly: info.ownerOnly,
        groupOnly: info.groupOnly,
        adminOnly: info.adminOnly,
      })
      .onConflictDoUpdate({
        target: commandsTable.name,
        set: {
          category: info.category,
          description: info.description,
          usage: info.usage,
          implemented: info.available,
          ownerOnly: info.ownerOnly,
          groupOnly: info.groupOnly,
          adminOnly: info.adminOnly,
        },
      });
  }
  return described;
}

export async function isCommandEnabled(botId: string, name: string) {
  const rows = await db
    .select()
    .from(commandSettings)
    .where(and(eq(commandSettings.botId, botId), eq(commandSettings.commandName, name)))
    .limit(1);
  return rows[0]?.enabled ?? true;
}

export async function setCommandEnabled(botId: string, name: string, enabled: boolean) {
  await db
    .insert(commandSettings)
    .values({ botId, commandName: name, enabled })
    .onConflictDoUpdate({
      target: [commandSettings.botId, commandSettings.commandName],
      set: { enabled, updatedAt: new Date() },
    });
}
