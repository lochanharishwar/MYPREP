import 'server-only';
import { db, entity, updateEntity } from './db';
import { connectionTokens, type Connection } from './social';
import { providerJSON } from './providers';
import { reserve } from './billing';
import { env } from './env';
import type { ContentVersion, ScheduledPost } from '../contracts';
export async function reconcilePublication(
  id: string,
  resolution?: { providerId: string; actorId: string; reason: string },
  manual = false,
) {
  const post = await entity<ScheduledPost>(id);
  if (!['verifying', 'uploading', 'publishing'].includes(post.payload.status))
    return { status: post.payload.status };
  if (!resolution && !manual && (post.payload.verificationAttempts ?? 0) >= 6)
    return { status: 'verifying', escalated: true };
  const attempts = (post.payload.verificationAttempts ?? 0) + 1;
  await updateEntity(id, {
    ...post.payload,
    verificationAttempts: attempts,
    lastVerifiedAt: new Date().toISOString(),
  });
  const c = await entity<Connection>(
      post.payload.accountId,
      post.workspace_id,
      'connection',
    ),
    content = await entity<ContentVersion>(
      post.payload.contentId,
      post.workspace_id,
      'content',
    );
  await reserve(
    { workspaceId: post.workspace_id, brandId: post.brand_id! },
    'METRICS',
  );
  const token = await connectionTokens(c),
    h = { authorization: `Bearer ${token.access_token}` };
  const p = c.payload.platform,
    uploaded = post.payload.upload;
  let matches: { id: string; url: string }[] = [];
  const inWindow = (at: string) => {
    const delta = Date.parse(at) - Date.parse(post.payload.scheduledAt);
    return delta >= -60000 && delta <= 30 * 60000;
  };
  if (p === 'youtube' && typeof uploaded?.id === 'string') {
    const r = await providerJSON<{
      items: { id: string; status: { privacyStatus: string } }[];
    }>(
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${uploaded.id}`,
      { headers: h },
    );
    matches = r.items
      .filter((v) => v.status.privacyStatus === 'public')
      .map((v) => ({
        id: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
      }));
  }
  if (p === 'instagram') {
    const r = await providerJSON<{
      data: {
        id: string;
        caption?: string;
        timestamp: string;
        permalink: string;
      }[];
    }>(
      `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/${c.payload.accountId}/media?fields=id,caption,timestamp,permalink&limit=50`,
      { headers: h },
    );
    matches = r.data
      .filter(
        (v) => v.caption === content.payload.caption && inWindow(v.timestamp),
      )
      .map((v) => ({ id: v.id, url: v.permalink }));
  }
  if (p === 'x') {
    const r = await providerJSON<{
      data?: { id: string; text: string; created_at: string }[];
    }>(
      `https://api.x.com/2/users/${c.payload.accountId}/tweets?max_results=100&tweet.fields=created_at`,
      { headers: h },
    );
    matches = (r.data ?? [])
      .filter(
        (v) => v.text === content.payload.caption && inWindow(v.created_at),
      )
      .map((v) => ({ id: v.id, url: `https://x.com/i/web/status/${v.id}` }));
  }
  if (p === 'reddit') {
    const r = await providerJSON<{
      data: {
        children: {
          data: {
            id: string;
            title: string;
            selftext: string;
            created_utc: number;
            permalink: string;
            url: string;
          };
        }[];
      };
    }>(
      `https://oauth.reddit.com/user/${encodeURIComponent(c.payload.name)}/submitted?limit=100`,
      {
        headers: {
          ...h,
          'user-agent': env('REDDIT_USER_AGENT', 'MARKY/1.0'),
        },
      },
    );
    matches = r.data.children
      .map((x) => x.data)
      .filter(
        (v) =>
          inWindow(new Date(v.created_utc * 1000).toISOString()) &&
          v.title === content.payload.caption.split('\n')[0].slice(0, 300) &&
          (uploaded?.url
            ? v.url === uploaded.url
            : v.selftext === content.payload.caption),
      )
      .map((v) => ({ id: v.id, url: 'https://www.reddit.com' + v.permalink }));
  }
  if (p === 'linkedin') {
    const author = c.payload.destination || c.payload.accountId;
    const r = await providerJSON<{
      elements: {
        id: string;
        commentary: string;
        createdAt: number;
        lifecycleState: string;
      }[];
    }>(
      `https://api.linkedin.com/rest/posts?q=author&author=${encodeURIComponent(author)}&count=100&sortBy=LAST_MODIFIED`,
      {
        headers: {
          ...h,
          'LinkedIn-Version': env('LINKEDIN_API_VERSION', '202604'),
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
    );
    matches = r.elements
      .filter(
        (v) =>
          v.lifecycleState === 'PUBLISHED' &&
          v.commentary === content.payload.caption &&
          inWindow(new Date(v.createdAt).toISOString()),
      )
      .map((v) => ({
        id: v.id,
        url: `https://www.linkedin.com/feed/update/${encodeURIComponent(v.id)}`,
      }));
  }
  const verified = resolution
    ? matches.find((m) => m.id === resolution.providerId)
    : p === 'youtube' && matches.length === 1
      ? matches[0]
      : undefined;
  if (resolution && !verified)
    throw new Error(
      'The provider did not return that matching post for this destination. No state changed to published.',
    );
  if (verified) {
    const current = await entity<ScheduledPost>(id);
    if (current.payload.status === 'published') return { status: 'published' };
    await updateEntity(id, {
      ...current.payload,
      status: 'published',
      providerId: verified.id,
      url: verified.url,
      publishedAt: new Date().toISOString(),
      publicationTimeSource: 'verification_time',
      error: undefined,
    });
    if (resolution) {
      const { error } = await db()
        .from('audit_log')
        .insert({
          workspace_id: post.workspace_id,
          brand_id: post.brand_id,
          actor_id: resolution.actorId,
          resource_id: id,
          action: 'publication.operator_verified',
          details: { providerId: verified.id, reason: resolution.reason },
        });
      if (error) throw error;
    }
    return { status: 'published', ...verified };
  }
  await updateEntity(id, {
    ...post.payload,
    status: 'verifying',
    verificationAttempts: attempts,
    verificationCandidates: matches,
    requiresOperator: attempts >= 6 || matches.length > 0,
    error: matches.length
      ? 'More than one matching post was found. Resolve the destination manually before any retry.'
      : 'No uniquely verifiable public post found. This request will not be sent again automatically.',
  });
  return { status: 'verifying' };
}
