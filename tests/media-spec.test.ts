import { it, expect } from 'vitest';
import { validatePlatformContent, type MediaMetadata } from '../lib/media-spec';
const image: MediaMetadata = {
  mimeType: 'image/jpeg',
  width: 1080,
  height: 1350,
  duration: null,
  bytes: 100000,
  sha256: 'a'.repeat(64),
};
it('accepts prepared Instagram JPEG and rejects PNG', () => {
  expect(() =>
    validatePlatformContent({
      platform: 'instagram',
      format: 'image',
      caption: 'Reviewed caption',
      assetPath: 'asset.jpg',
      mimeType: 'image/jpeg',
      media: image,
    }),
  ).not.toThrow();
  expect(() =>
    validatePlatformContent({
      platform: 'instagram',
      format: 'image',
      caption: 'Reviewed caption',
      assetPath: 'asset.png',
      mimeType: 'image/png',
      media: { ...image, mimeType: 'image/png' },
    }),
  ).toThrow('JPEG');
});
it('rejects unsupported formats and overlength captions deterministically', () => {
  expect(() =>
    validatePlatformContent({
      platform: 'instagram',
      format: 'text',
      caption: 'Text',
      assetPath: null,
      mimeType: null,
    }),
  ).toThrow('Unsupported');
  expect(() =>
    validatePlatformContent({
      platform: 'x',
      format: 'text',
      caption: 'x'.repeat(281),
      assetPath: null,
      mimeType: null,
    }),
  ).toThrow('280');
});
it('requires observed media properties instead of a reviewer score', () => {
  expect(() =>
    validatePlatformContent({
      platform: 'youtube',
      format: 'video',
      caption: 'Video',
      assetPath: 'video.mp4',
      mimeType: 'video/mp4',
    }),
  ).toThrow('actual media');
});
