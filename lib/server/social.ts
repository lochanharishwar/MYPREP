import 'server-only';
import { boundedBytes } from './http';
import type { ContentVersion, Entity, Platform } from '../contracts';
import { db, assetUrl, updateEntity, rpc } from './db';
import { env, required } from './env';
import { storageBuckets } from './storage';
import { decrypt, encrypt } from './security';
import { providerJSON } from './providers';
export interface Connection {
  platform: Platform;
  accountId: string;
  name: string;
  status: 'connected' | 'expired';
  destination?: string;
  expiresAt?: string;
}
export interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
}
export interface Upload {
  id?: string;
  url?: string;
  session?: string;
  processing?: boolean;
  [key: string]: unknown;
}
export const capabilities: Record<
  Platform,
  { formats: string[]; note: string; captionLimit: number }
> = {
  instagram: {
    formats: ['image', 'video'],
    note: 'Professional Instagram account; publishing permission required.',
    captionLimit: 2200,
  },
  youtube: {
    formats: ['video'],
    note: 'A YouTube channel and authorized upload access are required; account settings can restrict publication.',
    captionLimit: 5000,
  },
  x: {
    formats: ['text', 'image', 'video'],
    note: 'X API credits and write/media scopes required.',
    captionLimit: 280,
  },
  linkedin: {
    formats: ['text', 'image', 'video'],
    note: 'Posts publish to the authorized member or configured organization.',
    captionLimit: 3000,
  },
  reddit: {
    formats: ['text', 'image', 'video'],
    note: 'Approved API access and a permitted subreddit required. Media publishes as a link.',
    captionLimit: 40000,
  },
};
const endpoints: Record<
  Platform,
  { authorize: string; token: string; scope: string }
> = {
  instagram: {
    authorize: 'https://www.instagram.com/oauth/authorize',
    token: 'https://api.instagram.com/oauth/access_token',
    scope:
      'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights',
  },
  youtube: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope:
      'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
  },
  x: {
    authorize: 'https://x.com/i/oauth2/authorize',
    token: 'https://api.x.com/2/oauth2/token',
    scope: 'tweet.read tweet.write users.read offline.access media.write',
  },
  linkedin: {
    authorize: 'https://www.linkedin.com/oauth/v2/authorization',
    token: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'openid profile w_member_social',
  },
  reddit: {
    authorize: 'https://www.reddit.com/api/v1/authorize',
    token: 'https://www.reddit.com/api/v1/access_token',
    scope: 'identity submit read history',
  },
};
export function callbackUrl(platform: Platform) {
  return `${required('APP_ORIGIN')}/api/oauth/${platform}/callback`;
}
export async function authorizationUrl(
  platform: Platform,
  state: string,
  verifier: string,
) {
  const config = endpoints[platform];
  const u = new URL(config.authorize);
  u.search = new URLSearchParams({
    client_id: required(platform.toUpperCase() + '_CLIENT_ID'),
    redirect_uri: callbackUrl(platform),
    response_type: 'code',
    scope: env(platform.toUpperCase() + '_SCOPES', config.scope),
    state,
  }).toString();
  if (platform === 'youtube') {
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
  }
  if (platform === 'reddit') u.searchParams.set('duration', 'permanent');
  if (platform === 'x') {
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    );
    u.searchParams.set(
      'code_challenge',
      Buffer.from(hash).toString('base64url'),
    );
    u.searchParams.set('code_challenge_method', 'S256');
  }
  return u.toString();
}
async function tokenRequest(
  platform: Platform,
  params: Record<string, string>,
): Promise<Tokens> {
  const key = platform.toUpperCase();
  const body = new URLSearchParams({
    ...params,
    client_id: required(key + '_CLIENT_ID'),
  });
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': env('REDDIT_USER_AGENT', 'MARKY/1.0'),
  };
  if (platform === 'x' || platform === 'reddit')
    headers.authorization =
      'Basic ' +
      btoa(
        `${required(key + '_CLIENT_ID')}:${required(key + '_CLIENT_SECRET')}`,
      );
  else body.set('client_secret', required(key + '_CLIENT_SECRET'));
  const result = await providerJSON<Tokens>(endpoints[platform].token, {
    method: 'POST',
    headers,
    body,
  });
  if (!result.access_token)
    throw new Error('Account authorization returned no token.');
  return {
    ...result,
    expires_at: Date.now() + (result.expires_in ?? 3600) * 1000,
  };
}
export async function exchange(
  platform: Platform,
  code: string,
  verifier: string,
) {
  let token = await tokenRequest(platform, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(platform),
    ...(platform === 'x' ? { code_verifier: verifier } : {}),
  });
  if (platform === 'instagram') {
    const u = new URL('https://graph.instagram.com/access_token');
    u.search = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: required('INSTAGRAM_CLIENT_SECRET'),
      access_token: token.access_token,
    }).toString();
    const t = await providerJSON<Tokens>(u.toString());
    token = { ...t, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 };
  }
  return token;
}
export async function identity(platform: Platform, token: string) {
  const h = {
    authorization: `Bearer ${token}`,
    'user-agent': env('REDDIT_USER_AGENT', 'MARKY/1.0'),
  };
  if (platform === 'instagram') {
    const d = await providerJSON<{
      id: string;
      user_id?: string;
      username: string;
    }>(
      `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/me?fields=id,user_id,username`,
      { headers: h },
    );
    return { accountId: d.user_id ?? d.id, name: d.username };
  }
  if (platform === 'youtube') {
    const d = await providerJSON<{
      items: { id: string; snippet: { title: string } }[];
    }>(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: h },
    );
    if (!d.items?.length)
      throw new Error('No YouTube channel is available on this account.');
    return { accountId: d.items[0].id, name: d.items[0].snippet.title };
  }
  if (platform === 'x') {
    const d = await providerJSON<{ data: { id: string; username: string } }>(
      'https://api.x.com/2/users/me',
      { headers: h },
    );
    return { accountId: d.data.id, name: d.data.username };
  }
  if (platform === 'linkedin') {
    const d = await providerJSON<{ sub: string; name: string }>(
      'https://api.linkedin.com/v2/userinfo',
      { headers: h },
    );
    return { accountId: `urn:li:person:${d.sub}`, name: d.name };
  }
  const d = await providerJSON<{ id: string; name: string }>(
    'https://oauth.reddit.com/api/v1/me',
    { headers: h },
  );
  return { accountId: d.id, name: d.name };
}
export async function connectionTokens(record: Entity<Connection>) {
  const read = async () => {
    const { data, error } = await db()
      .from('credentials')
      .select('encrypted,version')
      .eq('entity_id', record.id)
      .single();
    if (error) throw new Error('Reconnect this social account.');
    return data;
  };
  let row = await read();
  let token = await decrypt<Tokens>(row.encrypted);
  if (!token.expires_at || token.expires_at >= Date.now() + 120000)
    return token;
  const owner = crypto.randomUUID();
  if (
    !(await rpc<boolean>('claim_token_refresh', {
      p_id: record.id,
      p_owner: owner,
    }))
  )
    throw new Error(
      'Another job is refreshing this account. Retry after token refresh completes.',
    );
  try {
    row = await read();
    token = await decrypt<Tokens>(row.encrypted);
    if (token.expires_at && token.expires_at >= Date.now() + 120000)
      return token;
    if (record.payload.platform === 'instagram') {
      const renewed = await providerJSON<Tokens>(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token.access_token)}`,
      );
      token = {
        ...renewed,
        expires_at: Date.now() + (renewed.expires_in ?? 3600) * 1000,
      };
    } else {
      if (!token.refresh_token) throw new Error('Reconnect this account.');
      const renewed = await tokenRequest(record.payload.platform, {
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
      });
      token = {
        ...renewed,
        refresh_token: renewed.refresh_token ?? token.refresh_token,
      };
    }
    if (
      !(await rpc<boolean>('finish_token_refresh', {
        p_id: record.id,
        p_owner: owner,
        p_version: row.version,
        p_encrypted: await encrypt(token),
      }))
    )
      throw new Error(
        'Credentials changed during refresh. Retry with the current connection.',
      );
    return token;
  } catch (e) {
    if (
      [400, 401].includes(
        (e as { providerStatus?: number }).providerStatus ?? 0,
      )
    )
      await updateEntity(record.id, { ...record.payload, status: 'expired' });
    throw e;
  } finally {
    await rpc('release_token_refresh', { p_id: record.id, p_owner: owner });
  }
}

function headers(platform: Platform, token: string) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...(platform === 'linkedin'
      ? {
          'LinkedIn-Version': env('LINKEDIN_API_VERSION', '202604'),
          'X-Restli-Protocol-Version': '2.0.0',
        }
      : {}),
    ...(platform === 'reddit'
      ? { 'user-agent': env('REDDIT_USER_AGENT', 'MARKY/1.0') }
      : {}),
  };
}
async function mediaBytes(content: ContentVersion) {
  if (!content.assetPath) throw new Error('Generated media is missing.');
  const r = await fetch(await assetUrl(content.assetPath));
  if (!r.ok) throw new Error('Media is unavailable.');
  return boundedBytes(r, 18000000);
}
async function uploadBytes(
  url: string,
  bytes: Uint8Array,
  extra: Record<string, string> = {},
) {
  const u = new URL(url);
  if (
    u.protocol !== 'https:' ||
    ![
      'googleapis.com',
      'google.com',
      'linkedin.com',
      'licdn.com',
      'x.com',
    ].some((h) => u.hostname === h || u.hostname.endsWith('.' + h))
  )
    throw new Error('Unexpected upload endpoint.');
  const r = await fetch(url, {
    method: 'PUT',
    headers: extra,
    body: bytes as BodyInit,
    redirect: 'error',
  });
  if (!r.ok) throw new Error(`Media upload failed (${r.status}).`);
  return r;
}
export async function upload(
  connection: Entity<Connection>,
  content: ContentVersion,
  token: string,
): Promise<Upload> {
  const p = connection.payload.platform;
  const h = headers(p, token);
  if (!capabilities[p].formats.includes(content.format))
    throw new Error(`This format is not supported by ${p}.`);
  if (content.caption.length > capabilities[p].captionLimit)
    throw new Error('Caption exceeds the destination limit.');
  if (p === 'instagram') {
    if (!content.assetPath) throw new Error('Instagram requires media.');
    const d = await providerJSON<{ id: string }>(
      `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/${connection.payload.accountId}/media`,
      {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          caption: content.caption,
          ...(content.format === 'video'
            ? {
                media_type: 'REELS',
                video_url: await assetUrl(content.assetPath),
              }
            : { image_url: await assetUrl(content.assetPath) }),
        }),
      },
    );
    return { id: d.id, processing: true };
  }
  if (p === 'youtube') {
    if (content.format !== 'video')
      throw new Error('YouTube requires a video.');
    const bytes = await mediaBytes(content);
    const r = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          ...h,
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(bytes.length),
        },
        body: JSON.stringify({
          snippet: {
            title: content.caption.split('\n')[0].slice(0, 100),
            description: content.caption,
          },
          status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
        }),
      },
    );
    if (!r.ok || !r.headers.get('location'))
      throw new Error('Could not initialize YouTube upload.');
    return { session: r.headers.get('location')! };
  }
  if (p === 'x' && content.assetPath) {
    const bytes = await mediaBytes(content);
    const d = await providerJSON<{ data: { id: string } }>(
      'https://api.x.com/2/media/upload/initialize',
      {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          media_type: content.mimeType,
          total_bytes: bytes.length,
          media_category:
            content.format === 'video' ? 'tweet_video' : 'tweet_image',
        }),
      },
    );
    return { id: d.data.id };
  }
  if (p === 'linkedin' && content.assetPath) {
    const type = content.format === 'video' ? 'videos' : 'images';
    const bytes = await mediaBytes(content);
    const d = await providerJSON<{ value: Record<string, unknown> }>(
      `https://api.linkedin.com/rest/${type}?action=initializeUpload`,
      {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          initializeUploadRequest: {
            owner:
              connection.payload.destination || connection.payload.accountId,
            ...(type === 'videos'
              ? {
                  fileSizeBytes: bytes.length,
                  uploadCaptions: false,
                  uploadThumbnail: false,
                }
              : {}),
          },
        }),
      },
    );
    return { ...d.value, id: String(d.value.video ?? d.value.image) };
  }
  if (p === 'reddit' && content.assetPath) {
    const bytes = await mediaBytes(content);
    const path = `${connection.workspace_id}/${crypto.randomUUID()}.${content.format === 'video' ? 'mp4' : 'png'}`;
    const { error } = await db()
      .storage.from(storageBuckets().published)
      .upload(path, bytes, { contentType: content.mimeType ?? 'image/png' });
    if (error) throw error;
    return {
      url: db().storage.from(storageBuckets().published).getPublicUrl(path).data
        .publicUrl,
      publicPath: path,
    };
  }
  return {};
}
export async function finishUpload(
  connection: Entity<Connection>,
  content: ContentVersion,
  token: string,
  u: Upload,
): Promise<Upload> {
  const p = connection.payload.platform;
  const h = headers(p, token);
  if (p === 'youtube' && u.session) {
    const r = await uploadBytes(u.session, await mediaBytes(content), {
      'content-type': 'video/mp4',
    });
    const result = (await r.json()) as { id: string };
    return { ...u, id: result.id };
  }
  if (p === 'x' && u.id) {
    const bytes = await mediaBytes(content);
    for (let i = 0; i < bytes.length; i += 4000000) {
      const form = new FormData();
      form.set('media', new Blob([bytes.slice(i, i + 4000000)]));
      form.set('segment_index', String(i / 4000000));
      await providerJSON(`https://api.x.com/2/media/upload/${u.id}/append`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
    }
    await providerJSON(`https://api.x.com/2/media/upload/${u.id}/finalize`, {
      method: 'POST',
      headers: h,
      body: '{}',
    });
    return { ...u, processing: content.format === 'video' };
  }
  if (p === 'linkedin' && u.id && content.assetPath) {
    const bytes = await mediaBytes(content);
    if (content.format === 'video') {
      const parts = u.uploadInstructions as {
        uploadUrl: string;
        firstByte: number;
        lastByte: number;
      }[];
      const ids = [];
      for (const part of parts) {
        const r = await uploadBytes(
          part.uploadUrl,
          bytes.slice(part.firstByte, part.lastByte + 1),
          { authorization: `Bearer ${token}` },
        );
        const tag = r.headers.get('etag');
        if (!tag)
          throw new Error('LinkedIn did not return an upload part identifier.');
        ids.push(tag);
      }
      await providerJSON(
        'https://api.linkedin.com/rest/videos?action=finalizeUpload',
        {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            finalizeUploadRequest: {
              video: u.id,
              uploadToken: u.uploadToken,
              uploadedPartIds: ids,
            },
          }),
        },
      );
    } else
      await uploadBytes(String(u.uploadUrl), bytes, {
        authorization: `Bearer ${token}`,
      });
    return { ...u, processing: true };
  }
  return u;
}
export async function uploadReady(
  c: Entity<Connection>,
  token: string,
  u: Upload,
  format: string,
) {
  if (!u.processing) return true;
  const p = c.payload.platform;
  const h = headers(p, token);
  if (p === 'instagram') {
    const r = await providerJSON<{ status_code: string }>(
      `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/${u.id}?fields=status_code`,
      { headers: h },
    );
    if (['ERROR', 'EXPIRED'].includes(r.status_code))
      throw new Error('Instagram media processing failed.');
    return r.status_code === 'FINISHED';
  }
  if (p === 'x') {
    const r = await providerJSON<{
      data: { processing_info?: { state: string } };
    }>(`https://api.x.com/2/media/upload?media_id=${u.id}&command=STATUS`, {
      headers: h,
    });
    if (r.data.processing_info?.state === 'failed')
      throw new Error('X media processing failed.');
    return (
      !r.data.processing_info || r.data.processing_info.state === 'succeeded'
    );
  }
  if (p === 'linkedin') {
    const r = await providerJSON<{ status: string }>(
      `https://api.linkedin.com/rest/${format === 'video' ? 'videos' : 'images'}/${encodeURIComponent(u.id!)}`,
      { headers: h },
    );
    if (r.status === 'PROCESSING_FAILED')
      throw new Error('LinkedIn media processing failed.');
    return r.status === 'AVAILABLE';
  }
  return true;
}
export async function publish(
  c: Entity<Connection>,
  content: ContentVersion,
  token: string,
  u: Upload,
): Promise<{ id: string; url: string }> {
  const p = c.payload.platform;
  const h = headers(p, token);
  if (p === 'instagram') {
    const d = await providerJSON<{ id: string }>(
      `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/${c.payload.accountId}/media_publish`,
      {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ creation_id: u.id }),
      },
    );
    const detail = await providerJSON<{ permalink: string }>(
      `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/${d.id}?fields=permalink`,
      { headers: h },
    );
    return { id: d.id, url: detail.permalink };
  }
  if (p === 'youtube') {
    if (!u.id) throw new Error('Upload has no video ID.');
    await providerJSON(
      'https://www.googleapis.com/youtube/v3/videos?part=status',
      {
        method: 'PUT',
        headers: h,
        body: JSON.stringify({
          id: u.id,
          status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
        }),
      },
    );
    const r = await providerJSON<{
      items: { status: { privacyStatus: string } }[];
    }>(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${u.id}`, {
      headers: h,
    });
    if (r.items[0]?.status.privacyStatus !== 'public')
      throw new Error(
        'YouTube kept this upload private. Verify API project approval.',
      );
    return { id: u.id, url: `https://www.youtube.com/watch?v=${u.id}` };
  }
  if (p === 'x') {
    const d = await providerJSON<{ data: { id: string } }>(
      'https://api.x.com/2/tweets',
      {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          text: content.caption,
          ...(u.id ? { media: { media_ids: [u.id] } } : {}),
        }),
      },
    );
    return { id: d.data.id, url: `https://x.com/i/web/status/${d.data.id}` };
  }
  if (p === 'linkedin') {
    const r = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        author: c.payload.destination || c.payload.accountId,
        commentary: content.caption,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(u.id
          ? {
              content: {
                media: { id: u.id, title: content.caption.slice(0, 100) },
              },
            }
          : {}),
      }),
    });
    if (!r.ok) throw new Error(`LinkedIn publishing failed (${r.status}).`);
    const id = r.headers.get('x-restli-id');
    if (!id)
      throw new Error(
        'LinkedIn accepted the request but did not return a post ID.',
      );
    return {
      id,
      url: `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}`,
    };
  }
  const subreddit = c.payload.destination;
  if (!subreddit || !/^\w{2,30}$/.test(subreddit))
    throw new Error('Choose a destination subreddit before scheduling.');
  const form = new URLSearchParams({
    api_type: 'json',
    sr: subreddit,
    kind: u.url ? 'link' : 'self',
    title: content.caption.split('\n')[0].slice(0, 300),
    ...(u.url ? { url: u.url } : { text: content.caption }),
    resubmit: 'false',
    sendreplies: 'true',
  });
  const r = await providerJSON<{
    json: { errors: unknown[]; data?: { id: string; url: string } };
  }>('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: { ...h, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (r.json.errors?.length || !r.json.data)
    throw new Error(
      'Reddit did not accept the post. Check subreddit posting requirements.',
    );
  return r.json.data;
}
export async function metrics(
  c: Entity<Connection>,
  token: string,
  id: string,
  publishedAt?: string,
) {
  const p = c.payload.platform,
    h = headers(p, token);
  const result: Record<string, number | null> = {
    reach: null,
    impressions: null,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    clicks: null,
    watchTime: null,
    averageWatchPercentage: null,
  };
  let comments: { id: string; text: string; url: string }[] = [];
  if (p === 'youtube') {
    const r = await providerJSON<{
      items: {
        statistics: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }[];
    }>(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${id}`,
      { headers: h },
    );
    const s = r.items[0]?.statistics;
    result.views = s?.viewCount === undefined ? null : Number(s.viewCount);
    result.likes = s?.likeCount === undefined ? null : Number(s.likeCount);
    result.comments =
      s?.commentCount === undefined ? null : Number(s.commentCount);
    if (publishedAt && Number.isFinite(Date.parse(publishedAt))) {
      try {
        const query = new URLSearchParams({
          ids: 'channel==MINE',
          startDate: publishedAt.slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          metrics: 'estimatedMinutesWatched,averageViewPercentage,shares',
          filters: `video==${id}`,
        });
        const analytics = await providerJSON<{
          columnHeaders?: { name: string }[];
          rows?: (string | number)[][];
        }>(`https://youtubeanalytics.googleapis.com/v2/reports?${query}`, {
          headers: h,
        });
        const values = analytics.rows?.[0];
        if (values)
          for (const [i, column] of (analytics.columnHeaders ?? []).entries()) {
            const n = Number(values[i]);
            if (values[i] === undefined || !Number.isFinite(n)) continue;
            if (column.name === 'estimatedMinutesWatched')
              result.watchTime = n * 60;
            if (column.name === 'averageViewPercentage')
              result.averageWatchPercentage = n;
            if (column.name === 'shares') result.shares = n;
          }
      } catch (error) {
        if ((error as { providerStatus?: number }).providerStatus !== 403)
          throw error;
      }
    }
    try {
      const r = await providerJSON<{
        items: {
          snippet: {
            topLevelComment: { id: string; snippet: { textOriginal: string } };
          };
        }[];
      }>(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${id}&maxResults=100`,
        { headers: h },
      );
      comments = r.items.map((i) => ({
        id: i.snippet.topLevelComment.id,
        text: i.snippet.topLevelComment.snippet.textOriginal,
        url: `https://www.youtube.com/watch?v=${id}&lc=${i.snippet.topLevelComment.id}`,
      }));
    } catch {
      /* Comments may be disabled; counts remain independent. */
    }
  }
  if (p === 'x') {
    const r = await providerJSON<{
      data: {
        public_metrics?: Record<string, number>;
        non_public_metrics?: Record<string, number>;
      };
    }>(
      `https://api.x.com/2/tweets/${id}?tweet.fields=public_metrics,non_public_metrics`,
      { headers: h },
    );
    const m = r.data.public_metrics ?? {};
    result.likes = m.like_count ?? null;
    result.comments = m.reply_count ?? null;
    result.shares = m.retweet_count ?? null;
    result.saves = m.bookmark_count ?? null;
    result.impressions =
      m.impression_count ?? r.data.non_public_metrics?.impression_count ?? null;
  }
  if (p === 'instagram') {
    const r = await providerJSON<{
      like_count?: number;
      comments_count?: number;
    }>(
      `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/${id}?fields=like_count,comments_count`,
      { headers: h },
    );
    result.likes = r.like_count ?? null;
    result.comments = r.comments_count ?? null;
    try {
      const ins = await providerJSON<{
        data: {
          name: string;
          values?: { value: number }[];
          total_value?: { value: number };
        }[];
      }>(
        `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/${id}/insights?metric=reach,saved,shares,views`,
        { headers: h },
      );
      for (const m of ins.data)
        result[m.name === 'saved' ? 'saves' : m.name] =
          m.total_value?.value ?? m.values?.[0]?.value ?? null;
    } catch {
      /* API capability varies by media and account. */
    }
    try {
      const cm = await providerJSON<{ data: { id: string; text: string }[] }>(
        `https://graph.instagram.com/${env('META_API_VERSION', 'v23.0')}/${id}/comments?fields=id,text&limit=100`,
        { headers: h },
      );
      comments = cm.data.map((c) => ({
        ...c,
        url: `https://www.instagram.com/`,
      }));
    } catch {}
  }
  if (p === 'linkedin') {
    const r = await providerJSON<{
      likesSummary?: { totalLikes: number };
      commentsSummary?: { totalFirstLevelComments: number };
    }>(
      `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(id)}`,
      { headers: h },
    );
    result.likes = r.likesSummary?.totalLikes ?? null;
    result.comments = r.commentsSummary?.totalFirstLevelComments ?? null;
  }
  if (p === 'reddit') {
    const r = await providerJSON<{
      data: {
        children: {
          data: { score: number; num_comments: number; url: string };
        }[];
      };
    }>(`https://oauth.reddit.com/api/info?id=t3_${id.replace(/^t3_/, '')}`, {
      headers: h,
    });
    const d = r.data.children[0]?.data;
    result.net_score = d?.score ?? null;
    result.comments = d?.num_comments ?? null;
  }
  return {
    metrics: result,
    comments,
    definitions: {
      reach:
        'Platform-reported unique reach; not deduplicated across platforms.',
      impressions: 'Platform-reported impressions.',
      views: 'Platform-defined views; thresholds differ.',
      likes: 'Platform-reported likes; Reddit uses net_score instead.',
      watchTime: 'Watch time in seconds, only when supplied by the platform.',
      averageWatchPercentage:
        'YouTube Analytics average percentage of video watched; may exceed 100% for repeat viewing.',
    },
  };
}
export interface PublisherAdapter {
  capabilities: (typeof capabilities)[Platform];
  upload: typeof upload;
  finishUpload: typeof finishUpload;
  ready: typeof uploadReady;
  publish: typeof publish;
  metrics: typeof metrics;
}
export function adapter(platform: Platform): PublisherAdapter {
  return {
    capabilities: capabilities[platform],
    upload,
    finishUpload,
    ready: uploadReady,
    publish,
    metrics,
  };
}
