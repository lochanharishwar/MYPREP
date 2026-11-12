'use client';
import { Component, lazy, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { scheduleIdleWarmup } from '@/lib/idle-warmup';
import type { Page } from './marketing-app';

const loaders = {
  'brand-dna': () => import('./workspace-brand-view').then(m => ({ default: m.BrandView })),
  content: () => import('./workspace-content-view').then(m => ({ default: m.ContentView })),
  schedule: () => import('./workspace-schedule-view').then(m => ({ default: m.ScheduleView })),
  analytics: () => import('./workspace-analytics-view').then(m => ({ default: m.AnalyticsView })),
  insights: () => import('./workspace-insights-view').then(m => ({ default: m.InsightsView })),
};
type LazyPage = keyof typeof loaders;
const pending = new Map<LazyPage, ReturnType<typeof loaders[LazyPage]>>();
function load(page: LazyPage) {
  let result = pending.get(page);
  if (!result) {
    result = loaders[page]().catch(error => { pending.delete(page); throw error; });
    pending.set(page, result);
  }
  return result;
}
const screens = {
  'brand-dna': lazy(() => load('brand-dna')), content: lazy(() => load('content')),
  schedule: lazy(() => load('schedule')), analytics: lazy(() => load('analytics')),
  insights: lazy(() => load('insights')),
};
export function WorkspacePage({ page }: { page: LazyPage }) {
  const View = screens[page];
  return <View />;
}
function constrainedConnection() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
}
export function usePageWarmup(page: Page, routes: Array<{ id: string; path: string }>) {
  const router = useRouter();
  const warm = (id: string, path: string) => {
    // Explicit intent remains available on slow connections; background work does not.
    // Vinext accepts the serialized 'full' value; its Next compatibility types
    // describe this as an internal enum that is not exported by next/navigation.
    router.prefetch(path, { kind: 'full' as NonNullable<Parameters<typeof router.prefetch>[1]>['kind'] });
    return id in loaders ? load(id as LazyPage) : Promise.resolve();
  };
  useEffect(() => {
    if (constrainedConnection()) return;
    let lastInput = 0;
    const input = () => { lastInput = Date.now(); };
    document.addEventListener('input', input, true);
    document.addEventListener('keydown', input, true);
    const cancel = scheduleIdleWarmup(routes.filter(r => r.id !== page).map(r => () => warm(r.id, r.path)), {
      paused: () => document.readyState !== 'complete' || document.visibilityState !== 'visible' || !!constrainedConnection() || Date.now() - lastInput < 800,
      idle: window.requestIdleCallback ? callback => window.requestIdleCallback(callback, { timeout: 2500 }) : undefined,
      cancelIdle: window.cancelIdleCallback ? id => window.cancelIdleCallback(id) : undefined,
    });
    return () => { cancel(); document.removeEventListener('input', input, true); document.removeEventListener('keydown', input, true); };
  }, [page, router, routes]);
  return (id: string, path: string) => { void warm(id, path).catch(() => {}); };
}

export class PageLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="empty-state" role="alert"><h2>This page could not load</h2><p>Your saved workspace is still available. Reload to try again.</p><button className="primary-btn" onClick={() => window.location.reload()}>Reload page</button></section>;
    return this.props.children;
  }
}
