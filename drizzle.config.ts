import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  // Fail loudly instead of silently pushing to an invalid connection string.
  throw new Error("DATABASE_URL is not set — cannot run drizzle-kit push/generate.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: databaseUrl,
  },
});
