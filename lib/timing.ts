import type { Entity, ScheduledPost, MetricObservation } from './contracts';
export function postingWindows(
  posts: Entity<ScheduledPost>[],
  observations: Entity<MetricObservation>[],
  accountId: string,
  timeZone: string,
) {
  const samples: { hour: number; value: number; day: string }[] = [];
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    });
    for (const p of posts.filter(
      (p) =>
        p.payload.accountId === accountId && p.payload.status === 'published',
    )) {
      const at = (p.payload as ScheduledPost & { publishedAt?: string })
        .publishedAt;
      if (!at) continue;
      const m = observations
        .filter(
          (o) =>
            o.payload.postId === p.id &&
            Date.parse(o.payload.observedAt) - Date.parse(at) >= 86400000 &&
            Date.parse(o.payload.observedAt) - Date.parse(at) <= 172800000 &&
            o.payload.metrics.impressions !== null &&
            o.payload.metrics.impressions !== undefined,
        )
        .sort((a, b) =>
          a.payload.observedAt.localeCompare(b.payload.observedAt),
        )[0];
      if (m)
        samples.push({
          hour: Number(formatter.format(new Date(at))),
          value: m.payload.metrics.impressions!,
          day: at.slice(0, 10),
        });
    }
  } catch {
    return { experimental: true, hours: [9, 13, 18], sampleCount: 0 };
  }
  const groups = new Map<number, number[]>();
  for (const s of samples) {
    const bucket = groups.get(s.hour) ?? [];
    bucket.push(s.value);
    groups.set(s.hour, bucket);
  }
  const ranked = [...groups]
    .filter(([, v]) => v.length >= 3)
    .map(([hour, v]) => ({
      hour,
      mean: v.reduce((a, b) => a + b, 0) / v.length,
    }))
    .sort((a, b) => b.mean - a.mean || a.hour - b.hour);
  const enough =
    samples.length >= 12 &&
    new Set(samples.map((s) => s.day)).size >= 7 &&
    ranked.length >= 2;
  return {
    experimental: !enough,
    hours: enough ? ranked.slice(0, 3).map((r) => r.hour) : [9, 13, 18],
    sampleCount: samples.length,
  };
}
