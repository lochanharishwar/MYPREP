import type { Entity, ContentVersion, ScheduledPost, MetricObservation } from './contracts';
export function campaignProgress(records: Entity<unknown>[], brandId: string) {
  const own = records.filter(r => r.brand_id === brandId);
  const content = own.filter(r => r.kind === 'content') as Entity<ContentVersion>[];
  const posts = own.filter(r => r.kind === 'schedule') as Entity<ScheduledPost>[];
  return [
    { label: 'Brand evidence', href: '/brand-dna', count: own.filter(r => r.kind === 'dna').length },
    { label: 'Reviewed content', href: '/content', count: content.filter(r => ['qualified','approved'].includes(r.payload.status) && r.payload.review?.score >= 8.7).length },
    { label: 'Approved versions', href: '/content', count: content.filter(r => r.payload.status === 'approved').length },
    { label: 'Scheduled or published', href: '/schedule', count: posts.filter(r => ['scheduled','uploading','publishing','verifying','published'].includes(r.payload.status)).length },
    { label: 'Confirmed publication', href: '/schedule', count: posts.filter(r => r.payload.status === 'published').length },
    { label: 'Metric observations', href: '/analytics', count: own.filter(r => r.kind === 'metrics').length },
  ];
}
export function rankObservations(rows: Entity<MetricObservation>[], metric: string) {
  const latest = new Map<string, Entity<MetricObservation>>();
  for (const row of rows) {
    if (!Number.isFinite(Date.parse(row.payload.observedAt))) continue;
    const key = row.payload.platform + ':' + row.payload.postId;
    const previous = latest.get(key);
    if (!previous || Date.parse(previous.payload.observedAt) < Date.parse(row.payload.observedAt)) latest.set(key, row);
  }
  return [...latest.values()].filter(r => typeof r.payload.metrics[metric] === 'number' && Number.isFinite(r.payload.metrics[metric]))
    .sort((a,b) => b.payload.metrics[metric]! - a.payload.metrics[metric]!).slice(0,5);
}
