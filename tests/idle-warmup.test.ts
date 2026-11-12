import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleIdleWarmup } from '@/lib/idle-warmup';

afterEach(() => { vi.useRealTimers(); });
describe('gradual background page loading', () => {
  it('waits before starting and never overlaps module downloads', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const first = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const second = vi.fn(async () => {});
    const cancel = scheduleIdleWarmup([first, second], { paused: () => false });
    await vi.advanceTimersByTimeAsync(1799);
    expect(first).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(first).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10000);
    expect(second).not.toHaveBeenCalled();
    finish();
    await vi.advanceTimersByTimeAsync(1800);
    expect(second).toHaveBeenCalledOnce();
    cancel();
  });
  it('pauses for typing, hidden tabs and constrained connections', async () => {
    vi.useFakeTimers();
    let paused = true;
    const task = vi.fn(async () => {});
    const cancel = scheduleIdleWarmup([task], { paused: () => paused });
    await vi.advanceTimersByTimeAsync(7200);
    expect(task).not.toHaveBeenCalled();
    paused = false;
    await vi.advanceTimersByTimeAsync(1800);
    expect(task).toHaveBeenCalledOnce();
    cancel();
  });
  it('cancels queued idle callbacks when leaving a page', async () => {
    vi.useFakeTimers();
    const task = vi.fn(async () => {});
    let callback!: () => void;
    const cancelIdle = vi.fn();
    const cancel = scheduleIdleWarmup([task], { paused: () => false, idle: cb => { callback = cb; return 42; }, cancelIdle });
    await vi.advanceTimersByTimeAsync(1800);
    cancel(); callback();
    expect(cancelIdle).toHaveBeenCalledWith(42);
    expect(task).not.toHaveBeenCalled();
  });
  it('does not queue more work after cancelling an in-flight import', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const next = vi.fn(async () => {});
    const cancel = scheduleIdleWarmup([() => new Promise<void>(resolve => { finish = resolve; }), next], { paused: () => false });
    await vi.advanceTimersByTimeAsync(1800);
    cancel(); finish();
    await vi.advanceTimersByTimeAsync(9000);
    expect(next).not.toHaveBeenCalled();
  });
  it('continues after a failed speculative download without an unhandled rejection', async () => {
    vi.useFakeTimers();
    const task = vi.fn(async () => {});
    const cancel = scheduleIdleWarmup([async () => { throw new Error('offline'); }, task], { paused: () => false });
    await vi.advanceTimersByTimeAsync(3600);
    expect(task).toHaveBeenCalledOnce();
    cancel();
  });
});
