export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);

    (t as any).unref?.();
  });

export const jitter = (ms: number, pct = 0.2) =>
  Math.max(0, Math.round(ms * (1 - pct + Math.random() * 2 * pct)));
