import { sleep, jitter } from "./sleep";

export type Feature = {
  name: string;
  intervalMs: number;       // how often to run
  initialDelayMs?: number;  // optional delay at startup
  run: () => Promise<void>; // your feature code
};

export async function runScheduler(features: Feature[]) {
  // Track per-feature next run time
  const now = Date.now();
  const next: Record<string, number> = {};
  for (const f of features) {
    next[f.name] = now + (f.initialDelayMs ?? Math.floor(Math.random() * 5000));
  }

  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    const t = Date.now();
    // Choose due features (run sequentially to keep it simple & API-friendly)
    const due = features.filter(f => t >= next[f.name]);

    for (const f of due) {
      const started = Date.now();
      try {
        await f.run();
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Feature "${f.name}" error:`, e);
        // backoff on errors: run a bit later than usual
        next[f.name] = Date.now() + jitter(f.intervalMs * 1.5);
        continue;
      }
      // schedule next run with a little jitter
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, jitter(f.intervalMs) - elapsed);
      next[f.name] = Date.now() + remaining;
    }

    // Sleep until the next earliest feature is due (or a small cap)
    const soonest = Math.min(...features.map(f => next[f.name]));
    const wait = Math.max(250, Math.min(soonest - Date.now(), 5_000));
    await sleep(wait);
  }

  console.log("Scheduler stopped gracefully.");
  process.exit(1);
}
