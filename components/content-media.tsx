'use client';
// Private, expiring originals bypass public image optimization.
/* oxlint-disable next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from './workspace-provider';
import { VideoPreview } from './video-preview';
import type { Entity, ContentVersion } from '@/lib/contracts';
export function ContentMedia({ content }: { content: Entity<ContentVersion> }) {
  const { read } = useWorkspace();
  const container = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const el = container.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void read<{ url: string }>('/api/media?id=' + content.id)
          .then((r) => {
            if (active) setUrl(r.url);
          })
          .catch((e) => {
            if (active) setError((e as Error).message);
          });
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [content.id, read, revision]);
  return (
    <div ref={container}>
      {url ? (
        content.payload.format === 'video' ? (
          <VideoPreview
            src={url}
            transcript={content.payload.review.transcript}
          />
        ) : (
          <img
            className="media-preview"
            src={url}
            alt="Generated platform version for approval"
            onError={() =>
              setError('Media URL expired or unavailable. Reload to retry.')
            }
          />
        )
      ) : (
        <p className="muted small">Loading private media preview…</p>
      )}
      {error && (
        <p className="notice">
          {error}{' '}
          <button
            className="text-link"
            onClick={() => {
              setError('');
              setRevision((n) => n + 1);
            }}
          >
            Reload media
          </button>
        </p>
      )}
    </div>
  );
}
