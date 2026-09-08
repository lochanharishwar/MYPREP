import type { ContentVersion, Platform } from './contracts';
export interface MediaMetadata {
  mimeType: string;
  width: number;
  height: number;
  duration: number | null;
  bytes: number;
  sha256: string;
  videoCodec?: string;
  audioCodec?: string | null;
}
export const platformRules: Record<
  Platform,
  { formats: ContentVersion['format'][]; captionLimit: number }
> = {
  instagram: { formats: ['image', 'video'], captionLimit: 2200 },
  youtube: { formats: ['video'], captionLimit: 5000 },
  x: { formats: ['text', 'image', 'video'], captionLimit: 280 },
  linkedin: { formats: ['text', 'image', 'video'], captionLimit: 3000 },
  reddit: { formats: ['text', 'image', 'video'], captionLimit: 40000 },
};
export function validatePlatformContent(
  c: Pick<
    ContentVersion,
    'platform' | 'format' | 'caption' | 'mimeType' | 'assetPath' | 'media'
  >,
) {
  const rules = platformRules[c.platform];
  if (!rules.formats.includes(c.format))
    throw new Error('Unsupported format for this platform.');
  if (!c.caption.trim() || Array.from(c.caption).length > rules.captionLimit)
    throw new Error(
      `Caption must contain 1–${rules.captionLimit} characters for ${c.platform}.`,
    );
  if (
    c.platform === 'reddit' &&
    Array.from(c.caption.split('\n')[0]).length > 300
  )
    throw new Error('Reddit titles must be at most 300 characters.');
  if (c.format === 'text') return;
  const m = c.media;
  if (
    !m ||
    !c.assetPath ||
    m.mimeType !== c.mimeType ||
    !/^[a-f0-9]{64}$/.test(m.sha256)
  )
    throw new Error('Prepare and inspect the actual media before approval.');
  if (m.bytes <= 0 || m.bytes > 18000000 || m.width <= 0 || m.height <= 0)
    throw new Error(
      'Media exceeds the supported bounded asset size or has invalid dimensions.',
    );
  if (c.format === 'image') {
    if (!['image/jpeg', 'image/png'].includes(m.mimeType))
      throw new Error('Prepare a supported JPEG or PNG image.');
    if (
      c.platform === 'instagram' &&
      (m.mimeType !== 'image/jpeg' ||
        m.bytes > 8000000 ||
        m.width < 320 ||
        m.width > 1440 ||
        m.width / m.height < 0.8 ||
        m.width / m.height > 1.91)
    )
      throw new Error(
        'Instagram images require JPEG, 320–1440 pixels wide, ratio 4:5–1.91:1, and at most 8 MB.',
      );
    if (c.platform === 'x' && m.bytes > 5000000)
      throw new Error('X images must be at most 5 MB.');
  } else if (
    m.mimeType !== 'video/mp4' ||
    m.videoCodec !== 'h264' ||
    m.duration === null ||
    m.duration <= 0 ||
    m.duration > 60 ||
    (m.audioCodec && m.audioCodec !== 'aac')
  )
    throw new Error('Prepare H.264/AAC MP4 video of at most 60 seconds.');
}
