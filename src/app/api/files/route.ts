import path from "node:path";
import fs from "node:fs/promises";
import { withUser, json, errorJson } from "@/server/api";
import { WORKSPACE_DIR, ensureDirs } from "@/server/config";
import { logActivity } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD = 10 * 1024 * 1024;
const TEXT_EXT = new Set([
  ".txt", ".md", ".json", ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".yml", ".yaml", ".env.example", ".log", ".csv",
]);

async function userRoot(userId: number) {
  ensureDirs();
  const root = path.join(WORKSPACE_DIR, `user_${userId}`);
  await fs.mkdir(root, { recursive: true });
  return root;
}

/** Resolves a relative path inside the user's sandbox, blocking traversal. */
function safeResolve(root: string, relative: string) {
  const target = path.resolve(root, "." + path.sep + (relative || "").replace(/^\/+/, ""));
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path traversal blocked");
  return target;
}

export async function GET(req: Request) {
  return withUser(async (user) => {
    const root = await userRoot(user.id);
    const url = new URL(req.url);
    const rel = url.searchParams.get("path") ?? "";
    const mode = url.searchParams.get("mode") ?? "list";
    const target = safeResolve(root, rel);

    if (mode === "read") {
      const stat = await fs.stat(target).catch(() => null);
      if (!stat?.isFile()) return errorJson("File not found", 404);
      if (stat.size > 512 * 1024) return errorJson("File too large to open in the editor (512 KB max)", 413);
      const ext = path.extname(target).toLowerCase();
      if (!TEXT_EXT.has(ext) && stat.size > 64 * 1024) return errorJson("Binary file preview is not supported", 415);
      const content = await fs.readFile(target, "utf8").catch(() => null);
      if (content === null) return errorJson("File is not valid UTF-8 text", 415);
      return json({ path: rel, content, size: stat.size });
    }

    const stat = await fs.stat(target).catch(() => null);
    if (!stat) return json({ path: rel, entries: [] });
    if (!stat.isDirectory()) return errorJson("Not a directory", 400);
    const dirents = await fs.readdir(target, { withFileTypes: true });
    const entries = await Promise.all(
      dirents.map(async (d) => {
        const full = path.join(target, d.name);
        const s = await fs.stat(full).catch(() => null);
        return {
          name: d.name,
          type: d.isDirectory() ? "dir" : "file",
          size: s?.size ?? 0,
          modifiedAt: s?.mtime?.toISOString() ?? null,
          path: path.join(rel, d.name).replace(/\\/g, "/"),
        };
      }),
    );
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    return json({ path: rel, entries, root: `workspace/user_${user.id}` });
  });
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const root = await userRoot(user.id);
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const dir = String(form.get("path") ?? "");
      if (!(file instanceof File)) return errorJson("file field required");
      if (file.size > MAX_UPLOAD) return errorJson("Upload exceeds the 10 MB limit", 413);
      const cleanName = path.basename(file.name).replace(/[^\w.\- ]+/g, "_");
      const target = safeResolve(root, path.join(dir, cleanName));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
      await logActivity(user.id, "files.upload", `You uploaded ${cleanName}`);
      return json({ ok: true, path: path.relative(root, target) });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: "mkdir" | "create" | "write" | "rename";
      path?: string;
      content?: string;
      newPath?: string;
    };
    const target = safeResolve(root, body.path ?? "");

    switch (body.action) {
      case "mkdir":
        await fs.mkdir(target, { recursive: true });
        return json({ ok: true });
      case "create":
      case "write":
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, body.content ?? "", "utf8");
        await logActivity(user.id, "files.write", `You saved ${body.path}`);
        return json({ ok: true });
      case "rename": {
        if (!body.newPath) return errorJson("newPath required");
        const dest = safeResolve(root, body.newPath);
        await fs.rename(target, dest);
        return json({ ok: true });
      }
      default:
        return errorJson("Unknown action");
    }
  });
}

export async function DELETE(req: Request) {
  return withUser(async (user) => {
    const root = await userRoot(user.id);
    const url = new URL(req.url);
    const rel = url.searchParams.get("path");
    if (!rel) return errorJson("path required");
    const target = safeResolve(root, rel);
    if (target === root) return errorJson("Cannot delete the workspace root", 400);
    await fs.rm(target, { recursive: true, force: true });
    await logActivity(user.id, "files.delete", `You deleted ${rel}`);
    return json({ ok: true });
  });
}
