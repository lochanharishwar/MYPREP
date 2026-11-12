// Imports are serial, cancellable before dispatch, and never start paid work.
export function scheduleIdleWarmup(tasks: Array<() => Promise<unknown>>, environment: {
  paused: () => boolean;
  idle?: (callback: () => void) => number;
  cancelIdle?: (id: number) => void;
}, delay = 1800) {
  let stopped = false, index = 0;
  let timer: ReturnType<typeof setTimeout>;
  let idleId: number | undefined;
  const schedule = () => { if (!stopped && index < tasks.length) timer = setTimeout(tick, delay); };
  const run = async () => {
    idleId = undefined;
    if (stopped) return;
    if (environment.paused()) { schedule(); return; }
    try { await tasks[index++](); } catch { /* Intent or navigation can retry later. */ }
    schedule();
  };
  const tick = () => {
    if (stopped) return;
    if (environment.paused()) { schedule(); return; }
    if (environment.idle) idleId = environment.idle(() => { void run(); });
    else void run();
  };
  schedule();
  return () => { stopped = true; clearTimeout(timer); if (idleId !== undefined) environment.cancelIdle?.(idleId); };
}
