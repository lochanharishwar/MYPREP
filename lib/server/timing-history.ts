import 'server-only';
import { z } from 'zod';
import type {
  Entity,
  MetricObservation,
  Platform,
  ScheduledPost,
} from '../contracts';
import { db } from './db';

const DAY = 86400000;
const POST_LIMIT = 200;
const BATCH_SIZE = 20;
const OBSERVATION_LIMIT = 1000;
type PublishedPost = ScheduledPost & { publishedAt: string };

function canonicalId(value: unknown) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new Error('Invalid stored timing identifier.');
  return parsed.data.toLowerCase();
}
function canonicalTime(value: unknown) {
  const parsed = z.iso.datetime({ offset: true }).safeParse(value);
  if (!parsed.success) throw new Error('Invalid stored publication timestamp.');
  return new Date(parsed.data).toISOString();
}

/** Reads a bounded history independently of the paginated workspace gallery. */
export async function timingHistory(
  workspaceId: string,
  brandId: string,
  accountId: string,
  platform: Platform,
  now = Date.now(),
) {
  const start = new Date(now - 90 * DAY).toISOString();
  const end = new Date(now).toISOString();
  const client = db();
  const { data, error, count } = await client
    .from('entities')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .eq('kind', 'schedule')
    .eq('payload->>accountId', accountId)
    .eq('payload->>platform', platform)
    .eq('payload->>status', 'published')
    .gte('payload->>publishedAt', start)
    .lte('payload->>publishedAt', end)
    .order('payload->>publishedAt', { ascending: false })
    .order('id', { ascending: false })
    .limit(POST_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as Entity<PublishedPost>[];
  const posts = rows.slice(0, POST_LIMIT);
  let partial =
    rows.length > POST_LIMIT ||
    (count !== null ? count > posts.length : posts.length === POST_LIMIT);
  const totalPosts = count ?? rows.length;
  const bounds = posts.map((post) => {
    if (
      post.workspace_id !== workspaceId ||
      post.brand_id !== brandId ||
      post.kind !== 'schedule' ||
      post.payload.accountId !== accountId ||
      post.payload.platform !== platform ||
      post.payload.status !== 'published'
    )
      throw new Error('Unexpected timing history scope.');
    const id = canonicalId(post.id);
    const published = Date.parse(canonicalTime(post.payload.publishedAt));
    if (published < now - 90 * DAY || published > now)
      throw new Error('Unexpected timing history date.');
    return {
      id,
      start: new Date(published + DAY).toISOString(),
      end: new Date(Math.min(published + 2 * DAY, now)).toISOString(),
    };
  });
  const observations: Entity<MetricObservation>[] = [];
  // Twenty canonical IDs and ISO timestamps keep each PostgREST URL bounded.
  // Posts younger than a day cannot yet have comparable observations.
  const mature = bounds.filter((range) => range.start <= range.end);
  for (let i = 0; i < mature.length; i += BATCH_SIZE) {
    const batch = mature.slice(i, i + BATCH_SIZE);
    const filter = batch
      .map(
        (range) =>
          `and(payload->>postId.eq.${range.id},payload->>observedAt.gte.${range.start},payload->>observedAt.lte.${range.end})`,
      )
      .join(',');
    const result = await client
      .from('entities')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .eq('brand_id', brandId)
      .eq('kind', 'metrics')
      .eq('payload->>platform', platform)
      .or(filter)
      .order('payload->>observedAt', { ascending: true })
      .order('id', { ascending: true })
      .limit(OBSERVATION_LIMIT);
    if (result.error) throw result.error;
    const received = (result.data ?? []) as Entity<MetricObservation>[];
    const bounded = received.slice(0, OBSERVATION_LIMIT);
    partial ||=
      received.length > OBSERVATION_LIMIT ||
      (result.count !== null
        ? result.count > bounded.length
        : bounded.length === OBSERVATION_LIMIT);
    for (const observation of bounded) {
      const range = batch.find((b) => b.id === observation.payload.postId);
      const at = canonicalTime(observation.payload.observedAt);
      if (
        observation.workspace_id !== workspaceId ||
        observation.brand_id !== brandId ||
        observation.kind !== 'metrics' ||
        observation.payload.platform !== platform ||
        !range ||
        at < range.start ||
        at > range.end
      )
        throw new Error('Unexpected timing observation scope.');
    }
    observations.push(...bounded);
  }
  return { posts, observations, partial, totalPosts };
}
