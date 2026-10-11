import type { Entity, ScheduledPost, MetricObservation } from './contracts';
import { utcFromLocal } from './domain';

const DAY = 86400000;
export function localDate(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
type Sample = {
  hour: number;
  value: number;
  day: string;
  weekday: number;
  observedAt: string;
  postId: string;
};
export function postingWindows(
  posts: Entity<ScheduledPost>[],
  observations: Entity<MetricObservation>[],
  accountId: string,
  timeZone: string,
  options: { date?: string; now?: number; recentOnly?: boolean } = {},
) {
  const now = options.now ?? Date.now();
  const accountPosts = posts.filter(
    (p) =>
      p.payload.accountId === accountId && p.payload.status === 'published',
  );
  const platform = accountPosts[0]?.payload.platform;
  // Compare one metric per account. Unsupported metrics never become zero.
  const metric =
    platform === 'youtube' || platform === 'instagram'
      ? 'views'
      : platform === 'reddit'
        ? 'comments'
        : platform === 'linkedin'
          ? 'likes'
          : 'impressions';
  const samples: Sample[] = [];
  const fallback = () => ({
    experimental: true,
    hours: [9, 13, 18],
    sampleCount: samples.length,
    basis: 'experiment' as 'experiment' | 'weekday' | 'account',
    metric,
    ranked: [] as {
      hour: number;
      median: number;
      count: number;
      postIds: string[];
    }[],
    latestObservedAt: null as string | null,
  });
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    });
    const seen = new Set<string>();
    for (const p of accountPosts) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const at = (p.payload as ScheduledPost & { publishedAt?: string })
        .publishedAt;
      const published = Date.parse(at ?? '');
      if (
        !Number.isFinite(published) ||
        published > now ||
        (options.recentOnly && published < now - 90 * DAY)
      )
        continue;
      const m = observations
        .filter((o) => {
          const value = o.payload.metrics[metric],
            observed = Date.parse(o.payload.observedAt);
          return (
            o.payload.postId === p.id &&
            o.workspace_id === p.workspace_id &&
            o.brand_id === p.brand_id &&
            o.payload.platform === p.payload.platform &&
            observed <= now &&
            observed - published >= DAY &&
            observed - published <= 2 * DAY &&
            typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= 0
          );
        })
        .sort(
          (a, b) =>
            Date.parse(a.payload.observedAt) - Date.parse(b.payload.observedAt),
        )[0];
      if (!m) continue;
      const day = localDate(new Date(published), timeZone);
      samples.push({
        hour: Number(formatter.format(new Date(published))),
        value: m.payload.metrics[metric]!,
        day,
        weekday: new Date(day + 'T12:00:00Z').getUTCDay(),
        observedAt: m.payload.observedAt,
        postId: p.id,
      });
    }
  } catch {
    return fallback();
  }
  const rank = (items: Sample[]) => {
    const groups = new Map<number, Sample[]>();
    for (const s of items)
      groups.set(s.hour, [...(groups.get(s.hour) ?? []), s]);
    return [...groups]
      .filter(
        ([, v]) => v.length >= 3 && new Set(v.map((s) => s.day)).size >= 3,
      )
      .map(([hour, v]) => ({
        hour,
        median: median(v.map((s) => s.value)),
        count: v.length,
        postIds: v.map((s) => s.postId),
      }))
      .sort((a, b) => b.median - a.median || a.hour - b.hour);
  };
  const weekday = options.date
    ? new Date(options.date + 'T12:00:00Z').getUTCDay()
    : -1;
  const sameDay = samples.filter((s) => s.weekday === weekday);
  const dayRank = rank(sameDay),
    accountRank = rank(samples);
  const dayEnough =
    sameDay.length >= 6 &&
    dayRank.length >= 2 &&
    dayRank[0].median > dayRank[dayRank.length - 1].median;
  const accountEnough =
    samples.length >= 12 &&
    new Set(samples.map((s) => s.day)).size >= 7 &&
    accountRank.length >= 2 &&
    accountRank[0].median > accountRank[accountRank.length - 1].median;
  if (!dayEnough && !accountEnough) return fallback();
  const selected = dayEnough ? sameDay : samples,
    ranked = (dayEnough ? dayRank : accountRank).slice(0, 3);
  return {
    experimental: false,
    hours: ranked.map((r) => r.hour),
    sampleCount: selected.length,
    basis: (dayEnough ? 'weekday' : 'account') as
      | 'weekday'
      | 'account'
      | 'experiment',
    metric,
    ranked,
    latestObservedAt:
      selected
        .map((s) => s.observedAt)
        .sort()
        .at(-1) ?? null,
  };
}

export function postingSuggestions(
  posts: Entity<ScheduledPost>[],
  observations: Entity<MetricObservation>[],
  accountId: string,
  timeZone: string,
  now = Date.now(),
) {
  const today = localDate(new Date(now), timeZone);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.parse(today + 'T12:00:00Z') + i * DAY)
      .toISOString()
      .slice(0, 10);
    const evidence = postingWindows(posts, observations, accountId, timeZone, {
      date,
      now,
      recentOnly: true,
    });
    const slots = evidence.hours.flatMap((hour) => {
      const localTime = `${date}T${String(hour).padStart(2, '0')}:00`;
      try {
        const utc = utcFromLocal(localTime, timeZone);
        return Date.parse(utc) > now + 600000
          ? [
              {
                localTime,
                utc,
                hour,
                evidence: evidence.ranked.find((r) => r.hour === hour),
              },
            ]
          : [];
      } catch {
        return [];
      }
    });
    return { date, ...evidence, slots };
  });
}
