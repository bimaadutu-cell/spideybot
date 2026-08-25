import os from "node:os";
import fs from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { DATA_DIR, ensureDirs } from "@/server/config";

const globalForLoop = globalThis as typeof globalThis & {
  __spideyLoop?: ReturnType<typeof monitorEventLoopDelay>;
  __spideyCpu?: { idle: number; total: number };
};

function loopMonitor() {
  if (!globalForLoop.__spideyLoop) {
    const h = monitorEventLoopDelay({ resolution: 20 });
    h.enable();
    globalForLoop.__spideyLoop = h;
  }
  return globalForLoop.__spideyLoop;
}

function cpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

/** Real system metrics measured from the running Node process and host. */
export async function systemMetrics() {
  const now = cpuTimes();
  const prev = globalForLoop.__spideyCpu ?? now;
  globalForLoop.__spideyCpu = now;
  const idleDelta = now.idle - prev.idle;
  const totalDelta = now.total - prev.total;
  const cpuPercent = totalDelta > 0 ? Math.min(100, Math.max(0, (1 - idleDelta / totalDelta) * 100)) : 0;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const mem = process.memoryUsage();
  const loop = loopMonitor();

  let storage: { totalBytes: number; freeBytes: number; usedPercent: number } | null = null;
  try {
    ensureDirs();
    const stat = await fs.statfs(DATA_DIR);
    const totalBytes = stat.blocks * stat.bsize;
    const freeBytes = stat.bavail * stat.bsize;
    storage = {
      totalBytes,
      freeBytes,
      usedPercent: totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0,
    };
  } catch {
    storage = null;
  }

  const net = os.networkInterfaces();
  const interfaces = Object.entries(net)
    .flatMap(([name, addrs]) =>
      (addrs ?? []).filter((a) => !a.internal && a.family === "IPv4").map((a) => ({ name, address: a.address })),
    )
    .slice(0, 4);

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    nodeVersion: process.version,
    cpu: {
      model: os.cpus()[0]?.model ?? "unknown",
      cores: os.cpus().length,
      usagePercent: Number(cpuPercent.toFixed(1)),
      loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedPercent: Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1)),
      processRssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
    },
    eventLoop: {
      meanMs: Number((loop.mean / 1e6).toFixed(2)),
      p99Ms: Number((loop.percentile(99) / 1e6).toFixed(2)),
      maxMs: Number((loop.max / 1e6).toFixed(2)),
    },
    storage,
    network: { interfaces },
    processUptimeSec: Math.round(process.uptime()),
    systemUptimeSec: Math.round(os.uptime()),
    ts: Date.now(),
  };
}
